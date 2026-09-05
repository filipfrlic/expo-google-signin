import type {
  AuthorizationResult,
  AuthorizeOptions,
  ConfigureOptions,
  SignInButtonOptions,
  SignInOptions,
  SignInResult,
} from './types';
import { loadGis } from './web/loadGis';
import { sessionFromIdToken } from './web/session';
import { writeCached, clearCached, readCached } from './web/storage';
import { requestAccessToken, type OAuth2Namespace } from './web/tokenClient';
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
    oauth2: OAuth2Namespace;
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
  const outcome = sessionFromIdToken(credential, config);
  if (outcome.ok) {
    writeCached(outcome.result);
  }
  return outcome;
};

/**
 * `google.accounts.id.initialize` is global: a second call replaces the first
 * caller's callback and nonce, so only one consumer can own GIS at a time.
 * Whoever initializes last takes over, and the displaced owner is told so it
 * fails loudly instead of waiting forever for a credential that will now be
 * delivered to someone else — or, worse, resolving against a nonce it never
 * asked for.
 */
let releaseCurrentOwner: (() => void) | undefined;

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
  onCredential: (credential: string) => void,
  onSuperseded: () => void
): void => {
  releaseCurrentOwner?.();
  releaseCurrentOwner = onSuperseded;
  google.accounts.id.initialize({
    client_id: config.webClientId,
    callback: (response) => onCredential(response.credential),
    nonce,
    use_fedcm_for_prompt: true,
    auto_select: false,
  });
};

const SUPERSEDED =
  'superseded by another Google Identity Services call — only one signIn() or ' +
  'sign-in button can be active at a time';

let configured: ConfigureOptions | undefined;

const configure = (options: ConfigureOptions): void => {
  configured = options;
  // Fire-and-forget — loadGis is idempotent; signIn awaits it.
  void loadGis();
};

/** Assert configure() ran, wait for GIS, and hand back the loaded namespace. */
const requireGis = async (): Promise<{ google: Google; config: ConfigureOptions }> => {
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
  return { google, config };
};

const signIn = async (options: SignInOptions): Promise<SignInResult> => {
  const { google, config } = await requireGis();
  return new Promise<SignInResult>((resolve, reject) => {
    let settled = false;
    initializeGis(
      google,
      config,
      options.nonce,
      (credential) => {
        if (settled) return;
        settled = true;
        const outcome = resolveCredential(credential, config);
        if (outcome.ok) {
          resolve(outcome.result);
        } else {
          reject(outcome.error);
        }
      },
      () => {
        if (settled) return;
        settled = true;
        reject(new GoogleSigninError('ERR_UNKNOWN', `sign-in ${SUPERSEDED}`));
      }
    );
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
  // Re-applies the hostedDomain gate: a session cached before the app was
  // configured with one — or under a different one — is not a valid session now.
  return readCached(configured ?? {});
};

const authorize = async (options: AuthorizeOptions): Promise<AuthorizationResult> => {
  if (!options?.scopes?.length) {
    throw new GoogleSigninError('ERR_UNKNOWN', 'authorize() requires at least one scope');
  }
  const { google, config } = await requireGis();
  return requestAccessToken(google.accounts.oauth2, {
    clientId: config.webClientId,
    scopes: options.scopes,
    hostedDomain: config.hostedDomain,
    // A hint only — see the caveat on AuthorizationResult. Taken from the ID
    // token rather than the cached user blob so it cannot be steered by
    // whatever happens to be sitting in sessionStorage.
    loginHint: readCached(config)?.user.email,
  });
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
      initializeGis(
        google,
        config,
        options.nonce,
        (credential) => {
          if (unmounted) return;
          const outcome = resolveCredential(credential, config);
          if (outcome.ok) {
            options.onSuccess(outcome.result);
          } else {
            options.onError?.(outcome.error);
          }
        },
        () => {
          if (unmounted) return;
          options.onError?.(
            new GoogleSigninError('ERR_UNKNOWN', `sign-in button ${SUPERSEDED}`)
          );
        }
      );
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

export default { configure, signIn, signOut, getCurrentUser, authorize };
