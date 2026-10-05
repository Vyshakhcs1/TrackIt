import AsyncStorage from '@react-native-async-storage/async-storage';

function keyForUser(userId: string): string {
  return `@trackit/auto-sync/${userId}`;
}

export async function readAutoSyncEnabled(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(keyForUser(userId))) === 'true';
}

export async function writeAutoSyncEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await AsyncStorage.setItem(keyForUser(userId), String(enabled));
}