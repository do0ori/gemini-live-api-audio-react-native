// services/AudioOutputService.js
// Rule III: Audio Output Service

import { Buffer } from "buffer";
import { AudioContext } from 'react-native-audio-api';
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import InCallManager from "react-native-incall-manager";
import { AEC_ENABLED, AGC_ENABLED, NS_ENABLED } from "../config";

// Constants for audio output from Gemini Live API
const OUTPUT_SAMPLE_RATE = 24000; // Gemini outputs at 24kHz
const OUTPUT_CHANNELS = 1; // Mono
const OUTPUT_BITS_PER_SAMPLE = 16; // 16-bit PCM

// Buffer aggregation settings to reduce fragmentation
const BUFFER_CHUNK_THRESHOLD = 3; // Aggregate this many chunks before playing
const MAX_BUFFER_WAIT_MS = 300; // Maximum time to wait for buffer to fill (ms)

// Audio player state
let audioContext = null;
let isPlaying = false;
let audioQueue = [];
let bufferAggregator = []; // Stores chunks for aggregation
let bufferTimer = null; // Timer for buffer processing
let tempFileCounter = 0;
let isSpeakerOn = true; // Default to speaker on

// Keep track of InCallManager initialization status
let isInCallManagerInitialized = false;

// Function to toggle speaker mode
const toggleSpeakerMode = (isOn) => {
    if (isInCallManagerInitialized && InCallManager && typeof InCallManager.setForceSpeakerphoneOn === 'function') {
        isSpeakerOn = isOn;
        InCallManager.setForceSpeakerphoneOn(isSpeakerOn);
        console.log(`AudioOutputService: Speaker mode set to ${isSpeakerOn ? 'ON' : 'OFF'}`);
    } else {
        console.warn('AudioOutputService: Cannot toggle speaker mode, InCallManager not ready.');
    }
};

// Initialize InCallManager safely - only if available
const initializeInCallManager = async () => {
    if (isInCallManagerInitialized) {
        // console.log('AudioOutputService: InCallManager already initialized');
        return true;
    }

    // Check if InCallManager is actually available
    if (!InCallManager) {
        // console.log('AudioOutputService: InCallManager not available, skipping initialization');
        return false;
    }

    try {
        // console.log('AudioOutputService: Initializing InCallManager...');

        // Add a small delay to ensure proper device initialization
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Make sure InCallManager is still available after the delay
        if (!InCallManager || typeof InCallManager.start !== "function") {
            console.warn(
                "AudioOutputService: InCallManager not available after delay"
            );
            return false;
        }

        // Start InCallManager with explicit configuration
        InCallManager.start({
            media: "audio", // Use audio mode
            auto: true, // Automatically configure
            ringback: "", // No ringback tone
            force: true, // Force these settings
            forceSpeakerOn: isSpeakerOn, // Use state variable
            enableAEC: AEC_ENABLED, // Enable Acoustic Echo Cancellation
            enableAGC: AGC_ENABLED, // Enable Automatic Gain Control
            enableNS: NS_ENABLED, // Enable Noise Suppression
        });

        // Add another small delay to ensure initialization completes
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Now try to force speaker mode - with extra safety check
        if (
            InCallManager &&
            typeof InCallManager.setForceSpeakerphoneOn === "function"
        ) {
            InCallManager.setForceSpeakerphoneOn(isSpeakerOn);
            // console.log('AudioOutputService: Speaker mode forced on');
        } else {
            console.warn(
                "AudioOutputService: Could not force speaker mode - method not available"
            );
        }

        // If we made it here, consider InCallManager initialized
        isInCallManagerInitialized = true;
        return true;
    } catch (error) {
        console.error(
            "AudioOutputService: Error initializing InCallManager:",
            error
        );
        return false;
    }
};

// Configure audio for playback
const configureAudio = async () => {
    try {
        // console.log('AudioOutputService: Configuring audio...');

        audioContext = new AudioContext();

        // console.log('AudioOutputService: Audio playback configured');

        // Only after Audio.setAudioModeAsync, initialize InCallManager
        const inCallManagerSuccess = await initializeInCallManager();

        // Set audio to maximum volume on Android
        if (Platform.OS === "android" && isInCallManagerInitialized) {
            try {
                InCallManager.setAudioVolume(1.0);
            } catch (volumeError) {
                console.warn(
                    "AudioOutputService: Error setting audio volume:",
                    volumeError
                );
            }
        }

        console.log("AudioOutputService: Audio configured successfully");
        return true;
    } catch (error) {
        console.error("AudioOutputService: Error configuring audio:", error);
        return false;
    }
};

// --- Helper Functions for WAV creation --- START ---

/**
 * Creates a WAV file from PCM data
 * @param {Uint8Array|ArrayBuffer} pcmData - Raw PCM audio data
 * @param {number} sampleRate - Sample rate in Hz (e.g., 24000 for Gemini API)
 * @param {number} numChannels - Number of audio channels (1 for mono, 2 for stereo)
 * @param {number} bitsPerSample - Bits per sample (usually 16)
 * @returns {Buffer} - WAV file data as a Buffer
 */
const _createWavFromPcm = (pcmData, sampleRate, numChannels, bitsPerSample) => {
    try {
        const pcmBytes =
            pcmData instanceof ArrayBuffer ? new Uint8Array(pcmData) : pcmData;
        const header = _createWavHeader(
            sampleRate,
            bitsPerSample,
            numChannels,
            pcmBytes.length
        );
        const wavData = _combineWavData(header, pcmBytes);
        console.log(
            `📻👷 AudioOutputService: WAV with (${wavData.length} bytes) from PCM (${pcmBytes.length} bytes) at ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit`
        );
        return wavData;
    } catch (error) {
        console.error("Error creating WAV from PCM:", error);
        throw error;
    }
};

/**
 * Creates a WAV header with the specified audio parameters
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} bitsPerSample - Bits per sample (8, 16, etc.)
 * @param {number} numChannels - Number of channels (1 for mono, 2 for stereo)
 * @param {number} dataLength - Length of audio data in bytes
 * @returns {Buffer} - WAV header as a Buffer
 */
const _createWavHeader = (
    sampleRate,
    bitsPerSample,
    numChannels,
    dataLength
) => {
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const buffer = Buffer.alloc(44); // WAV header is 44 bytes

    // RIFF header
    buffer.write("RIFF", 0); // ChunkID
    buffer.writeUInt32LE(36 + dataLength, 4); // ChunkSize: 36 + SubChunk2Size
    buffer.write("WAVE", 8); // Format

    // fmt subchunk
    buffer.write("fmt ", 12); // SubChunk1ID
    buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(byteRate, 28); // ByteRate
    buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
    buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

    // data subchunk
    buffer.write("data", 36); // SubChunk2ID
    buffer.writeUInt32LE(dataLength, 40); // SubChunk2Size

    return buffer;
};

/**
 * Combines WAV header with PCM data
 * @param {Buffer} header - WAV header
 * @param {Uint8Array|Buffer} pcmData - PCM audio data
 * @returns {Buffer} - Combined WAV file as a Buffer
 */
const _combineWavData = (header, pcmData) => {
    try {
        const combinedLength = header.length + pcmData.length;
        const combinedBuffer = Buffer.alloc(combinedLength);

        // Copy header and PCM data into the combined buffer
        header.copy(combinedBuffer, 0);

        // Copy PCM data after the header
        if (pcmData instanceof Buffer) {
            pcmData.copy(combinedBuffer, header.length);
        } else {
            // Handle Uint8Array
            Buffer.from(pcmData).copy(combinedBuffer, header.length);
        }

        return combinedBuffer;
    } catch (error) {
        console.error("Error combining WAV data:", error);
        throw error;
    }
};

/**
 * Save WAV data to a temporary file
 * @param {Buffer} wavData - WAV file data
 * @returns {Promise<string>} - URI of the saved file
 */
const _saveWavToTempFile = async (wavData) => {
    try {
        // Create a unique filename for this audio chunk
        const tempFilePath = `${
            FileSystem.cacheDirectory
        }audio_${Date.now()}_${tempFileCounter++}.wav`;

        // Convert Buffer to base64 string for FileSystem.writeAsStringAsync
        const base64Data = wavData.toString("base64");

        // Write the file
        await FileSystem.writeAsStringAsync(tempFilePath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
        });

        // console.log(`AudioOutputService: Saved WAV file to ${tempFilePath}`);
        return tempFilePath;
    } catch (error) {
        console.error("Error saving WAV to temp file:", error);
        throw error;
    }
};

// --- Helper Functions --- END ---

/**
 * Play audio from a sound object
 * @param {AudioNode} playerNode - The playerNode object to play
 * @returns {Promise<boolean>} - Whether playback started successfully
 */
const _playSoundObject = async (playerNode) => {
    try {
        // console.log('AudioOutputService: Playing sound object');

        // Ensure audio is forced to speaker before every playback
        try {
            // Force speaker mode with InCallManager if available
            if (
                isInCallManagerInitialized &&
                InCallManager &&
                typeof InCallManager.setForceSpeakerphoneOn === "function"
            ) {
                InCallManager.setForceSpeakerphoneOn(isSpeakerOn);
            }

            // console.log('AudioOutputService: Audio session re-activated for playback with speaker mode');
        } catch (sessionError) {
            console.warn(
                "AudioOutputService: Error re-activating audio session:",
                sessionError
            );
            // Continue anyway, as the error might be that it's already activated
        }

        // Play the sound
        playerNode.start(audioContext.currentTime);
        console.log("AudioOutputService: Playback started successfully");
        return true;
    } catch (error) {
        console.error("AudioOutputService: Error playing sound:", error);
        return false;
    }
};

/**
 * Clean up a sound object
 * @param {AudioNode} playerNode - The sound object to unload
 */
const _cleanupSoundObject = async (playerNode) => {
    try {
        if (playerNode) {
            playerNode.disconnect();
            console.log("AudioOutputService: Sound unloaded");
        }
    } catch (error) {
        console.error("AudioOutputService: Error unloading sound:", error);
    }
};

/**
 * Process the audio queue
 */
const _processQueue = async () => {
    if (isPlaying || audioQueue.length === 0) {
        return;
    }

    try {
        isPlaying = true;
        const queueItem = audioQueue.shift();

        // Handle the new object format with type, data, and mimeType fields
        // Extract the actual audio data from the object if needed
        let audioData, sampleRate;

        if (
            queueItem &&
            typeof queueItem === "object" &&
            queueItem.type === "audio" &&
            queueItem.data
        ) {
            // New format: { type: 'audio', data: arrayBuffer, mimeType: string }
            audioData = queueItem.data;

            // Parse sample rate from mimeType if available
            if (queueItem.mimeType && queueItem.mimeType.includes("rate=")) {
                const rateMatch = queueItem.mimeType.match(/rate=(\d+)/);
                if (rateMatch && rateMatch[1]) {
                    sampleRate = parseInt(rateMatch[1], 10);
                    // console.log(`AudioOutputService: Detected sample rate from mimeType: ${sampleRate}Hz`);
                }
            }
        } else {
            // Legacy format: direct audio data
            audioData = queueItem;
        }

        // Validate audio data
        if (!audioData) {
            console.error(
                "AudioOutputService: Received null or empty audio data"
            );
            isPlaying = false;
            _processQueue(); // Try next item
            return;
        }

        // Log detailed info about the audio data for debugging
        // console.log(
        //   `🔊🔊 AudioOutputService: audioData type=${typeof audioData}` +
        //   (audioData instanceof ArrayBuffer
        //     ? `, ArrayBuffer length=${audioData.byteLength}`
        //     : audioData instanceof Uint8Array
        //     ? `, Uint8Array length=${audioData.length}`
        //     : typeof audioData === 'string'
        //     ? `, String length=${audioData.length}`
        //     : '')
        // );

        // Use detected sample rate or fallback to default
        const outputSampleRate = sampleRate || OUTPUT_SAMPLE_RATE;
        // console.log(`  - Using sample rate: ${outputSampleRate}Hz`);

        // Create a WAV file from the PCM data
        let wavData;

        try {
            if (typeof audioData === "string") {
                // Handle Base64 encoded audio
                // console.log('  - Converting Base64 string to PCM data');
                const pcmData = Buffer.from(audioData, "base64");
                wavData = _createWavFromPcm(
                    pcmData,
                    outputSampleRate,
                    OUTPUT_CHANNELS,
                    OUTPUT_BITS_PER_SAMPLE
                );
            } else if (
                audioData instanceof ArrayBuffer ||
                audioData instanceof Uint8Array
            ) {
                // Handle raw PCM data
                // console.log('  - Converting ArrayBuffer/Uint8Array to WAV');
                wavData = _createWavFromPcm(
                    audioData,
                    outputSampleRate,
                    OUTPUT_CHANNELS,
                    OUTPUT_BITS_PER_SAMPLE
                );
            } else {
                console.error(
                    "AudioOutputService: Unsupported audio data format",
                    typeof audioData
                );
                if (audioData && typeof audioData === "object") {
                    console.error("Keys available:", Object.keys(audioData));
                }
                isPlaying = false;
                _processQueue(); // Try next item
                return;
            }
        } catch (wavError) {
            console.error(
                "AudioOutputService: Error creating WAV data:",
                wavError
            );
            isPlaying = false;
            _processQueue(); // Try next item
            return;
        }

        // Validate WAV data
        if (!wavData || wavData.length < 44) {
            // 44 is minimum WAV header size
            console.error(
                `AudioOutputService: Invalid WAV data created (size: ${
                    wavData ? wavData.length : "null"
                })`
            );
            isPlaying = false;
            _processQueue(); // Try next item
            return;
        }

        try {
            const audioBuffer = await audioContext.decodeAudioData(wavData.buffer);

            const playerNode = audioContext.createBufferSource();
            playerNode.buffer = audioBuffer;
            playerNode.connect(audioContext.destination);

            // Set up completion listener
            playerNode.onended = () => {
                // console.log('AudioOutputService: Playback finished');
                isPlaying = false;
                _processQueue(); // Process next item in queue
            };

            // Play the sound
            console.log("AudioOutputService: Playing audio");
            const playSuccess = await _playSoundObject(playerNode);

            if (!playSuccess) {
                console.error("AudioOutputService: Failed to play audio");
                isPlaying = false;
                _processQueue(); // Try next item
            }
        } catch (error) {
            console.error("AudioOutputService: Error playing audio:", error);
            isPlaying = false;
            _processQueue(); // Try next item
        }
    } catch (error) {
        console.error("AudioOutputService: Error processing audio:", error);
        console.error("Stack trace:", error.stack);
        isPlaying = false;
        _processQueue(); // Try next item
    }
};

/**
 * Combines multiple PCM audio chunks into a single buffer
 * @param {Array} chunks - Array of audio chunks to combine
 * @returns {Object} - Combined audio data and sample rate
 */
const _combineAudioChunks = (chunks) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }

    // console.log(`AudioOutputService: Combining ${chunks.length} audio chunks`);

    try {
        // Extract all PCM data from chunks
        const pcmDataArray = [];
        let totalLength = 0;
        let sampleRate = OUTPUT_SAMPLE_RATE; // Default

        for (const chunk of chunks) {
            let pcmData;

            // Handle the new object format with type, data, and mimeType fields
            if (
                chunk &&
                typeof chunk === "object" &&
                chunk.type === "audio" &&
                chunk.data
            ) {
                pcmData = chunk.data;

                // Parse sample rate from mimeType if available
                if (chunk.mimeType && chunk.mimeType.includes("rate=")) {
                    const rateMatch = chunk.mimeType.match(/rate=(\d+)/);
                    if (rateMatch && rateMatch[1]) {
                        sampleRate = parseInt(rateMatch[1], 10);
                    }
                }
            } else if (typeof chunk === "string") {
                // Base64 encoded
                pcmData = Buffer.from(chunk, "base64");
            } else {
                // Raw PCM data
                pcmData = chunk;
            }

            // Convert all to Uint8Array for consistency
            if (pcmData instanceof ArrayBuffer) {
                pcmData = new Uint8Array(pcmData);
            }

            if (pcmData instanceof Uint8Array) {
                pcmDataArray.push(pcmData);
                totalLength += pcmData.length;
            }
        }

        // Create a combined buffer
        const combinedBuffer = new Uint8Array(totalLength);
        let offset = 0;

        for (const data of pcmDataArray) {
            combinedBuffer.set(data, offset);
            offset += data.length;
        }

        // console.log(`AudioOutputService: Combined ${chunks.length} chunks into ${totalLength} bytes`);
        return { data: combinedBuffer, sampleRate };
    } catch (error) {
        console.error(
            "AudioOutputService: Error combining audio chunks:",
            error
        );
        return null;
    }
};

/**s
 * Process the buffered chunks when enough are collected or timeout occurs
 */
const _processBufferedChunks = () => {
    // Clear any existing timer
    if (bufferTimer) {
        clearTimeout(bufferTimer);
        bufferTimer = null;
    }

    // If we have chunks to process
    if (bufferAggregator.length > 0) {
        // console.log(`AudioOutputService: Processing ${bufferAggregator.length} buffered chunks`);

        // Combine chunks and get the resulting audio data
        const combined = _combineAudioChunks(bufferAggregator);

        // Clear the buffer now that we've processed it
        bufferAggregator = [];

        if (combined) {
            // Create a wrapper object for the combined data
            const combinedChunk = {
                type: "audio",
                data: combined.data,
                mimeType: `audio/pcm;rate=${combined.sampleRate}`,
                isAggregated: true,
            };

            // Add to queue and process
            audioQueue.push(combinedChunk);
            _processQueue();
        }
    }
};

/**
 * Play an audio chunk received from the WebSocket
 * @param {ArrayBuffer|Uint8Array|string|Object} audioData - Audio data, possibly Base64 encoded or in an object
 */
const playAudioChunk = async (audioData) => {
    if (!audioData) {
        console.warn(
            "AudioOutputService: Received null or undefined audio data"
        );
        return;
    }

    try {
        // Initialize audio if not done already
        await configureAudio();

        // Log information about the audio data
        const dataType = typeof audioData;
        let dataSize = "unknown";

        if (dataType === "string") {
            dataSize = `${audioData.length} chars`;
        } else if (audioData instanceof ArrayBuffer) {
            dataSize = `${audioData.byteLength} bytes`;
        } else if (audioData instanceof Uint8Array) {
            dataSize = `${audioData.length} bytes`;
        } else if (dataType === "object") {
            dataSize = audioData.data
                ? audioData.data instanceof ArrayBuffer
                    ? `${audioData.data.byteLength} bytes`
                    : typeof audioData.data === "string"
                    ? `${audioData.data.length} chars`
                    : "unknown format"
                : "no data field";
        }

        // console.log(` 🎵 AudioOutputService: Received audio chunk to play. Type: ${dataType}, Size: ${dataSize}${dataType === 'object' && audioData.mimeType ? `, MIME type: ${audioData.mimeType}` : ''}`);

        // Add to buffer aggregator instead of directly to queue
        bufferAggregator.push(audioData);
        // console.log(`AudioOutputService: Added audio to buffer. Buffer size: ${bufferAggregator.length}`);

        // If this is the first chunk in the buffer, start the timer
        if (bufferAggregator.length === 1) {
            bufferTimer = setTimeout(
                _processBufferedChunks,
                MAX_BUFFER_WAIT_MS
            );
        }

        // If we've reached the threshold, process immediately
        if (bufferAggregator.length >= BUFFER_CHUNK_THRESHOLD) {
            _processBufferedChunks();
        }
    } catch (error) {
        console.error("AudioOutputService: Error queuing audio chunk:", error);
    }
};

/**
 * Cleanup audio resources and stop InCallManager
 * @returns {Promise<boolean>} - Whether cleanup was successful
 */
const cleanupAudioResources = async () => {
    try {
        console.log("AudioOutputService: Cleaning up audio resources...");

        // Stop InCallManager if it's running and AEC isn't enabled
        // If AEC is enabled, we leave InCallManager running to maintain AEC across sessions
        // We only stop it when the app is shutting down
        try {
            if (!AEC_ENABLED) {
                InCallManager.stop();
                console.log("AudioOutputService: InCallManager stopped");
            } else {
                console.log(
                    "AudioOutputService: Keeping InCallManager running for AEC"
                );
            }
        } catch (inCallError) {
            console.warn(
                "AudioOutputService: Error managing InCallManager:",
                inCallError
            );
        }

        isPlaying = false;
        console.log("AudioOutputService: Audio resources cleaned up");
    } catch (error) {
        console.error("AudioOutputService: Error during cleanup:", error);
    }
};

/**
 * Clear the audio playback queue and stop current playback
 */
const clearPlaybackQueue = async () => {
    try {
        console.log("AudioOutputService: Clearing audio playback queue");

        // Empty the queue and buffer
        audioQueue = [];
        bufferAggregator = [];

        // Clear any pending buffer timer
        if (bufferTimer) {
            clearTimeout(bufferTimer);
            bufferTimer = null;
        }

        // Reset playing state
        isPlaying = false;

        console.log("AudioOutputService: Playback queue cleared");
        return true;
    } catch (error) {
        console.error(
            "AudioOutputService: Error clearing playback queue:",
            error
        );
        return false;
    }
};

// Clean up temporary files periodically
const cleanupTempFiles = async () => {
    try {
        const cacheDir = FileSystem.cacheDirectory;
        const files = await FileSystem.readDirectoryAsync(cacheDir);
        const audioFiles = files.filter(
            (file) => file.startsWith("audio_") && file.endsWith(".wav")
        );

        console.log(
            `AudioOutputService: Found ${audioFiles.length} temporary audio files to clean up`
        );

        // Keep the 5 most recent files and delete the rest
        if (audioFiles.length > 5) {
            // Sort by creation time (which is part of the filename)
            audioFiles.sort().reverse();

            // Delete older files
            for (let i = 5; i < audioFiles.length; i++) {
                const filePath = `${cacheDir}${audioFiles[i]}`;
                await FileSystem.deleteAsync(filePath);
                console.log(
                    `AudioOutputService: Deleted temporary file ${audioFiles[i]}`
                );
            }
        }
    } catch (error) {
        console.error(
            "AudioOutputService: Error cleaning up temp files:",
            error
        );
    }
};

// Initialize the audio when the module loads
configureAudio();

// Set up a timer to clean up temporary files every 5 minutes
setInterval(cleanupTempFiles, 5 * 60 * 1000);

// Export API for use in other modules
export {
    cleanupAudioResources,
    cleanupTempFiles,
    clearPlaybackQueue,
    playAudioChunk,
    toggleSpeakerMode,
};

// Add event listener for app state changes to clean up resources when app is closed
if (Platform.OS === "ios") {
    // For iOS, we need to listen for app termination
    try {
        const { AppState } = require("react-native");
        AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "inactive" || nextAppState === "background") {
                // App is going to background or being closed, clean up resources
                cleanupAudioResources();
            }
        });
    } catch (error) {
        console.warn(
            "AudioOutputService: Could not set up AppState listener:",
            error
        );
    }
}

export default {
    playAudioChunk,
    clearPlaybackQueue,
    cleanupAudioResources, // Export the cleanup function so it can be called from outside
    toggleSpeakerMode,
};
