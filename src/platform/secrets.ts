import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * API keys, held in the iOS Keychain or the Android Keystore. Nothing else in the app stores them:
 * not the database, not exports, not backups.
 *
 * The browser has no secure store, so the web build, which is only used for development,
 * keeps keys in the page's local storage instead.
 */
const keyName = (providerId: string) => `provider.${providerId}.key`;
const WEB_PREFIX = 'anki.secret.';

export async function readApiKey(providerId: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(WEB_PREFIX + keyName(providerId)) ?? null;
  return SecureStore.getItemAsync(keyName(providerId));
}

export async function saveApiKey(providerId: string, key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(WEB_PREFIX + keyName(providerId), key);
    return;
  }
  await SecureStore.setItemAsync(keyName(providerId), key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function deleteApiKey(providerId: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(WEB_PREFIX + keyName(providerId));
    return;
  }
  await SecureStore.deleteItemAsync(keyName(providerId));
}
