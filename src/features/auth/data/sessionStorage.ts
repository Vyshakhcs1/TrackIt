import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../domain/models/AuthUser';

const sessionKey = '@trackit/session-user';

export async function readSessionUser(): Promise<AuthUser | null> {
  const serializedUser = await AsyncStorage.getItem(sessionKey);
  if (!serializedUser) {
    return null;
  }

  const user: unknown = JSON.parse(serializedUser);
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    !('displayName' in user) ||
    !('email' in user) ||
    !('accessToken' in user) ||
    typeof user.id !== 'string' ||
    typeof user.displayName !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.accessToken !== 'string'
  ) {
    await AsyncStorage.removeItem(sessionKey);
    return null;
  }

  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    accessToken: user.accessToken,
  };
}

export async function writeSessionUser(user: AuthUser): Promise<void> {
  await AsyncStorage.setItem(sessionKey, JSON.stringify(user));
}

export async function clearSessionUser(): Promise<void> {
  await AsyncStorage.removeItem(sessionKey);
}