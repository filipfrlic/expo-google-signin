import type { SignInResult } from '../types';
import { decodeIdToken } from './decodeIdToken';

const KEY = 'expo-google-signin:session';

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export const readCached = (): SignInResult | null => {
  if (!isBrowser()) return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  let parsed: SignInResult;
  try {
    parsed = JSON.parse(raw) as SignInResult;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
  try {
    const { exp } = decodeIdToken(parsed.idToken);
    if (typeof exp === 'number' && exp * 1000 <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
  return parsed;
};

export const writeCached = (result: SignInResult): void => {
  if (!isBrowser()) return;
  sessionStorage.setItem(KEY, JSON.stringify(result));
};

export const clearCached = (): void => {
  if (!isBrowser()) return;
  sessionStorage.removeItem(KEY);
};
