const { getDefaultConfig } = require("expo/metro-config");
const {
    wrapWithAudioAPIMetroConfig,
} = require("react-native-audio-api/metro-config");

const config = getDefaultConfig(__dirname);
config.transformer.assetRegistryPath = require.resolve(
    "react-native/Libraries/Image/AssetRegistry"
);

module.exports = wrapWithAudioAPIMetroConfig(config);
