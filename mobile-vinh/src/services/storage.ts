import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createChunkedStorage } from './chunkedStorage';

// Web preview sessions stay in memory; native sessions use Keychain/Keystore.
const memory = new Map<string, string>();
const rawStorage = {
  async getItem(key: string): Promise<string | null> {
    return Platform.OS === 'web' ? memory.get(key) ?? null : SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { memory.set(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') { memory.delete(key); return; }
    await SecureStore.deleteItemAsync(key);
  },
};
export const secureStorage = createChunkedStorage(rawStorage);
