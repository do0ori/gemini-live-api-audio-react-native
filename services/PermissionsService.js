// services/PermissionsService.js
// Rule V: Permissions Service

import { PermissionsAndroid, Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

const requestMicrophonePermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message:
            'This app needs access to your microphone to stream audio.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('PermissionsService: Microphone permission granted (Android)');
        return true;
      } else {
        console.log('PermissionsService: Microphone permission denied (Android)');
        return false;
      }
    } catch (err) {
      console.warn('PermissionsService: Error requesting microphone permission (Android):', err);
      return false;
    }
  } else if (Platform.OS === 'ios') {
    try {
      const result = await request(PERMISSIONS.IOS.MICROPHONE);
      if (result === RESULTS.GRANTED) {
        console.log('PermissionsService: Microphone permission granted (iOS)');
        return true;
      } else {
        console.log('PermissionsService: Microphone permission denied (iOS)');
        return false;
      }
    } catch (err) {
      console.warn('PermissionsService: Error requesting microphone permission (iOS):', err);
      return false;
    }
  }
  // Other platforms not handled
  return false;
};

export default {
  requestMicrophonePermission,
};
