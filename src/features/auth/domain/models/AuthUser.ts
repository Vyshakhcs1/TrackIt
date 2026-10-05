export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  accessToken: string;
}

export type AuthStatus = 'restoring' | 'signedOut' | 'signingIn' | 'signedIn';