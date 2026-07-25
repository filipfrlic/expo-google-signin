import type {
  ConfigureOptions,
  SignInButtonOptions,
  SignInOptions,
  SignInResult,
} from './types';
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
      renderButton: (
        parent: HTMLElement,
        options: {
          theme?: SignInButtonOptions['theme'];
          size?: SignInButtonOptions['size'];
          text?: SignInButtonOptions['text'];
          shape?: SignInButtonOptions['shape'];
          logo_alignment?: SignInButtonOptions['logo_alignment'];
          width?: number;
        }
      ) => void;
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

/**
 * Initialize GIS with the options this package always sends, forwarding the
 * raw credential to the caller. Shared by `signIn` and
 * `renderGoogleSignInButton` — they differ only in what they do afterwards
 * (prompt vs. render) and in how they guard against late callbacks.
 */
const initializeGis = (
  google: Google,
  config: ConfigureOptions,
  nonce: string | undefined,
  onCredential: (credential: string) => void
): void => {
  google.accounts.id.initialize({
    client_id: config.webClientId,
    callback: (response) => onCredential(response.credential),
    nonce,
    use_fedcm_for_prompt: true,
    auto_select: false,
  });
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
    initializeGis(google, config, options.nonce, (credential) => {
      if (settled) return;
      settled = true;
      const outcome = resolveCredential(credential, config);
      if (outcome.ok) {
        resolve(outcome.result);
      } else {
        reject(outcome.error);
      }
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

export const renderGoogleSignInButton = (
  element: HTMLElement,
  options: SignInButtonOptions
): (() => void) => {
  if (!configured) {
    throw new GoogleSigninError('ERR_NOT_CONFIGURED', 'configure() was not called');
  }
  const config = configured;
  let unmounted = false;
  const unmount = () => {
    unmounted = true;
    element.replaceChildren();
  };

  loadGis().then(
    () => {
      if (unmounted) return;
      const google = window.google;
      if (!google) {
        options.onError?.(
          new GoogleSigninError('ERR_UNKNOWN', 'Google Identity Services failed to load')
        );
        return;
      }
      initializeGis(google, config, options.nonce, (credential) => {
        if (unmounted) return;
        const outcome = resolveCredential(credential, config);
        if (outcome.ok) {
          options.onSuccess(outcome.result);
        } else {
          options.onError?.(outcome.error);
        }
      });
      google.accounts.id.renderButton(element, {
        theme: options.theme,
        size: options.size,
        text: options.text,
        shape: options.shape,
        logo_alignment: options.logo_alignment,
        width: options.width,
      });
    },
    () => {
      if (unmounted) return;
      options.onError?.(
        new GoogleSigninError('ERR_NETWORK', 'Failed to load Google Identity Services')
      );
    }
  );

  return unmount;
};

export default { configure, signIn, signOut, getCurrentUser };
