import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createJSONStorage } from 'zustand/middleware';

export const appStorage = createJSONStorage(() => AsyncStorage);

const API_KEY_ID = 'mylovecoach.anthropic_api_key';

/** 개인 API 키는 SecureStore(키체인/키스토어)에 저장 */
export async function loadApiKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return (await AsyncStorage.getItem(API_KEY_ID)) ?? null;
    return await SecureStore.getItemAsync(API_KEY_ID);
  } catch {
    return null;
  }
}

export async function saveApiKey(key: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (key) await AsyncStorage.setItem(API_KEY_ID, key);
    else await AsyncStorage.removeItem(API_KEY_ID);
    return;
  }
  if (key) await SecureStore.setItemAsync(API_KEY_ID, key);
  else await SecureStore.deleteItemAsync(API_KEY_ID);
}
