const {
    wrapWithAudioAPIMetroConfig,
} = require("react-native-audio-api/metro-config");

const config = {
    // 기존 Metro 설정이 있다면 여기에 추가
};

module.exports = wrapWithAudioAPIMetroConfig(config);
