import type { ConfigureOptions, SignInOptions, SignInResult } from './types';
import { loadGis } from './web/loadGis';
import { decodeIdToken } from './web/decodeIdToken';
import { writeCached, clearCached, readCached } from './web/storage';
import { GoogleSigninError } from './errors';

type Moment = {
  isDismissedMoment: () => boolean;
  getDismissedReason?: () => string;
};

type Google = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        nonce?: string;
        use_fedcm_for_prompt?: boolean;
        auto_select?: boolean;
      }) => void;
      prompt: (listener?: (notification: Moment) => void) => void;
      disableAutoSelect: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: Google;
  }
}

// Under FedCM (Chrome 128+), GIS only fires display and dismissed moments; the
// legacy isNotDisplayed/isSkippedMoment predicates always return false and
// reading them logs a deprecation warning. Stick to the dismissed channel.
const CANCEL_REASONS = new Set(['user_cancel', 'tap_outside', 'cancel_called']);

const mapMomentToCode = (
  n: Moment
): 'ERR_SIGN_IN_CANCELLED' | 'ERR_UNKNOWN' | null => {
  if (!n.isDismissedMoment()) return null;
  const reason = n.getDismissedReason?.();
  if (reason === 'credential_returned' || reason === 'flow_restarted') return null;
  if (reason && CANCEL_REASONS.has(reason)) return 'ERR_SIGN_IN_CANCELLED';
  return 'ERR_UNKNOWN';
};

export const resolveCredential = (
  credential: string,
  config: ConfigureOptions
): { ok: true; result: SignInResult } | { ok: false; error: GoogleSigninError } => {
  try {
    const decoded = decodeIdToken(credential);
    if (config.hostedDomain && decoded.hd !== config.hostedDomain) {
      return {
        ok: false,
        error: new GoogleSigninError(
          'ERR_NO_CREDENTIAL',
          `hostedDomain mismatch: expected ${config.hostedDomain}, got ${decoded.hd ?? 'none'}`
        ),
      };
    }
    const user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name ?? null,
      givenName: decoded.given_name ?? null,
      familyName: decoded.family_name ?? null,
      photo: decoded.picture ?? null,
    };
    const result: SignInResult = { idToken: credential, user };
    writeCached(result);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: new GoogleSigninError('ERR_UNKNOWN', (err as Error).message),
    };
  }
};

let configured: ConfigureOptions | undefined;

const configure = (options: ConfigureOptions): void => {
  configured = options;
  // Fire-and-forget — loadGis is idempotent; signIn awaits it.
  void loadGis();
};

const signIn = async (options: SignInOptions): Promise<SignInResult> => {
  if (!configured) {
    throw new GoogleSigninError('ERR_NOT_CONFIGURED', 'configure() was not called');
  }
  const config = configured;
  try {
    await loadGis();
  } catch {
    throw new GoogleSigninError('ERR_NETWORK', 'Failed to load Google Identity Services');
  }
  const google = window.google;
  if (!google) {
    throw new GoogleSigninError('ERR_UNKNOWN', 'Google Identity Services failed to load');
  }
  return new Promise<SignInResult>((resolve, reject) => {
    let settled = false;
    google.accounts.id.initialize({
      client_id: config.webClientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        const outcome = resolveCredential(response.credential, config);
        if (outcome.ok) {
          resolve(outcome.result);
        } else {
          reject(outcome.error);
        }
      },
      nonce: options.nonce,
      use_fedcm_for_prompt: true,
      auto_select: false,
    });
    google.accounts.id.prompt((notification) => {
      if (settled) return;
      const code = mapMomentToCode(notification);
      if (!code) return;
      settled = true;
      reject(new GoogleSigninError(code, notification.getDismissedReason?.() ?? 'sign-in not completed'));
    });
  });
};

const signOut = async (): Promise<void> => {
  if (typeof window !== 'undefined' && window.google) {
    window.google.accounts.id.disableAutoSelect();
  }
  clearCached();
};

const getCurrentUser = async (): Promise<SignInResult | null> => {
  return readCached();
};

export default { configure, signIn, signOut, getCurrentUser };
