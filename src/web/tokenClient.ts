import { GoogleSigninError } from '../errors';
import type { AuthorizationResult } from '../types';

/**
 * Wrapper around the `google.accounts.oauth2` token client.
 *
 * This is a different GIS namespace from `google.accounts.id` (used for sign-in):
 * it runs the OAuth 2.0 implicit flow in a popup and yields an access token with
 * no ID token and no refresh token. The popup requires a user gesture, so callers
 * must invoke this from a real click handler.
 */

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Non-OAuth failures — popup blocked, popup closed. */
type TokenError = {
  type?: string;
  message?: string;
};

export type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

export type OAuth2Namespace = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: TokenError) => void;
    hd?: string;
  }) => TokenClient;
};

// GIS reports a closed/dismissed popup through error_callback rather than as an
// OAuth error, and a blocked popup separately from one the user closed.
const POPUP_BLOCKED = 'popup_failed_to_open';

const toResult = (response: TokenResponse): AuthorizationResult => ({
  accessToken: response.access_token as string,
  grantedScopes: (response.scope ?? '').split(' ').filter(Boolean),
  expiresAt:
    typeof response.expires_in === 'number'
      ? Date.now() + response.expires_in * 1000
      : null,
});

export const requestAccessToken = (
  oauth2: OAuth2Namespace,
  options: { clientId: string; scopes: string[]; hostedDomain?: string }
): Promise<AuthorizationResult> =>
  new Promise<AuthorizationResult>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const client = oauth2.initTokenClient({
      client_id: options.clientId,
      scope: options.scopes.join(' '),
      hd: options.hostedDomain,
      callback: (response) => {
        settle(() => {
          if (response.error) {
            // access_denied is the user refusing consent, not a failure.
            const code =
              response.error === 'access_denied'
                ? 'ERR_SIGN_IN_CANCELLED'
                : 'ERR_UNKNOWN';
            reject(
              new GoogleSigninError(
                code,
                response.error_description ?? response.error
              )
            );
            return;
          }
          if (!response.access_token) {
            reject(
              new GoogleSigninError('ERR_UNKNOWN', 'no access token in token response')
            );
            return;
          }
          resolve(toResult(response));
        });
      },
      error_callback: (error) => {
        settle(() => {
          const code =
            error.type === POPUP_BLOCKED ? 'ERR_NETWORK' : 'ERR_SIGN_IN_CANCELLED';
          const message =
            error.type === POPUP_BLOCKED
              ? 'the authorization popup was blocked — call authorize() from a user gesture'
              : (error.message ?? 'authorization was not completed');
          reject(new GoogleSigninError(code, message));
        });
      },
    });

    client.requestAccessToken();
  });
