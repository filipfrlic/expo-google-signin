import { GoogleSigninError } from '../errors';
import type { ConfigureOptions, SignInResult } from '../types';
import { decodeIdToken } from './decodeIdToken';

export type SessionOutcome =
  | { ok: true; result: SignInResult }
  | { ok: false; error: GoogleSigninError };

type SessionConfig = Pick<ConfigureOptions, 'hostedDomain'>;

/**
 * Turn a raw ID token into a `SignInResult`, applying every gate the token
 * itself can answer: expiry, then `hostedDomain`.
 *
 * The ID token is the only artifact Google signed, so it is the sole source of
 * truth for who is signed in — every `GoogleUser` this package hands out is
 * derived here. A caller that stores a result must re-run this on read rather
 * than trusting the stored copy, otherwise the cache becomes a second and
 * unverified answer to "who is signed in".
 *
 * Note this decodes without verifying the signature, which no browser can do
 * offline. It is a filter, not authentication: the backend still has to verify
 * the token it receives.
 */
export const sessionFromIdToken = (
  idToken: string,
  config: SessionConfig
): SessionOutcome => {
  let decoded;
  try {
    decoded = decodeIdToken(idToken);
  } catch (err) {
    return {
      ok: false,
      error: new GoogleSigninError('ERR_UNKNOWN', (err as Error).message),
    };
  }

  if (typeof decoded.exp === 'number' && decoded.exp * 1000 <= Date.now()) {
    return {
      ok: false,
      error: new GoogleSigninError('ERR_NO_CREDENTIAL', 'ID token has expired'),
    };
  }

  if (config.hostedDomain && decoded.hd !== config.hostedDomain) {
    return {
      ok: false,
      error: new GoogleSigninError(
        'ERR_NO_CREDENTIAL',
        `hostedDomain mismatch: expected ${config.hostedDomain}, got ${decoded.hd ?? 'none'}`
      ),
    };
  }

  return {
    ok: true,
    result: {
      idToken,
      user: {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name ?? null,
        givenName: decoded.given_name ?? null,
        familyName: decoded.family_name ?? null,
        photo: decoded.picture ?? null,
      },
    },
  };
};
