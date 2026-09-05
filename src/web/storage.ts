import type { ConfigureOptions, SignInResult } from '../types';
import { sessionFromIdToken } from './session';

const KEY = 'expo-google-signin:session';

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

/**
 * Read the cached session, rebuilding the user from the stored ID token.
 *
 * Only the token is trusted. The stored `user` blob is a render cache and is
 * discarded on every read, so a stale or tampered copy cannot outlive the token
 * it was derived from. Anything unusable — expired, malformed, or outside the
 * configured `hostedDomain` — is dropped from storage and reported as no
 * session at all.
 */
export const readCached = (
  config: Pick<ConfigureOptions, 'hostedDomain'> = {}
): SignInResult | null => {
  if (!isBrowser()) return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;

  let idToken: unknown;
  try {
    idToken = (JSON.parse(raw) as { idToken?: unknown }).idToken;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
  if (typeof idToken !== 'string') {
    sessionStorage.removeItem(KEY);
    return null;
  }

  const outcome = sessionFromIdToken(idToken, config);
  if (!outcome.ok) {
    sessionStorage.removeItem(KEY);
    return null;
  }
  return outcome.result;
};

export const writeCached = (result: SignInResult): void => {
  if (!isBrowser()) return;
  sessionStorage.setItem(KEY, JSON.stringify(result));
};

export const clearCached = (): void => {
  if (!isBrowser()) return;
  sessionStorage.removeItem(KEY);
};
