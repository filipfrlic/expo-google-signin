/**
 * Shared test harness for the web module.
 *
 * The web implementation talks to Google Identity Services through the global
 * `window.google` namespace, which only appears once the injected script
 * loads. This harness stubs `document.head.appendChild` so the "script" resolves
 * on the next microtask with a mock GIS global installed, letting tests drive
 * credential callbacks and prompt moments synchronously.
 *
 * Not a test file — `testMatch` only picks up `__tests__/*.test.ts`.
 */

export const GIS_URL = 'https://accounts.google.com/gsi/client';
export const SESSION_KEY = 'expo-google-signin:session';

export const initializeFn = jest.fn();
export const promptFn = jest.fn();
export const renderButtonFn = jest.fn();
export const disableAutoSelectFn = jest.fn();

// google.accounts.oauth2 — the access-token namespace, separate from accounts.id.
export const initTokenClientFn = jest.fn();
export const requestAccessTokenFn = jest.fn();

/** Mutable per-test state, populated by the hooks `setupGisHarness` installs. */
export const harness = {
  appendSpy: undefined as unknown as jest.SpyInstance,
  injectedScript: undefined as HTMLScriptElement | undefined,
};

function installGisGlobal() {
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: initializeFn,
        prompt: promptFn,
        renderButton: renderButtonFn,
        disableAutoSelect: disableAutoSelectFn,
      },
      oauth2: {
        initTokenClient: initTokenClientFn,
      },
    },
  };
}

/** Register the beforeEach/afterEach hooks. Call once at the top of a suite. */
export function setupGisHarness() {
  beforeEach(() => {
    jest.resetModules();
    initializeFn.mockReset();
    promptFn.mockReset();
    renderButtonFn.mockReset();
    disableAutoSelectFn.mockReset();
    initTokenClientFn.mockReset();
    requestAccessTokenFn.mockReset();
    // initTokenClient returns the client whose requestAccessToken starts the flow.
    initTokenClientFn.mockReturnValue({ requestAccessToken: requestAccessTokenFn });
    sessionStorage.clear();
    delete (window as unknown as { google?: unknown }).google;
    harness.injectedScript = undefined;
    harness.appendSpy = jest
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node) => {
        if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
          harness.injectedScript = node;
          queueMicrotask(() => {
            installGisGlobal();
            node.onload?.(new Event('load'));
          });
        }
        return node;
      });
  });

  afterEach(() => {
    harness.appendSpy.mockRestore();
  });
}

/** Make the injected GIS script fail to load instead of resolving. */
export function simulateGisLoadFailure() {
  harness.appendSpy.mockReset();
  harness.appendSpy.mockImplementation((node) => {
    if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
      queueMicrotask(() => node.onerror?.(new Event('error')));
    }
    return node;
  });
}

type WebModule = {
  configure: (opts: {
    webClientId: string;
    iosClientId?: string;
    hostedDomain?: string;
  }) => void;
  signIn: (opts: { nonce?: string }) => Promise<{ idToken: string; user: unknown }>;
  signOut: () => Promise<void>;
  getCurrentUser: () => Promise<{ idToken: string; user: unknown } | null>;
  authorize: (opts: { scopes: string[] }) => Promise<{
    accessToken: string;
    grantedScopes: string[];
    expiresAt: number | null;
  }>;
};

export function loadModule(): WebModule {
  return require('../../ExpoGoogleSigninModule.web').default as WebModule;
}

type ButtonSuccess = { idToken: string; user: unknown };
export type ButtonOptions = {
  onSuccess: (result: ButtonSuccess) => void;
  onError?: (error: { code: string; message: string }) => void;
  nonce?: string;
  theme?: string;
  size?: string;
  text?: string;
  shape?: string;
  logo_alignment?: string;
  width?: number;
};

export function loadButton() {
  return require('../../ExpoGoogleSigninModule.web').renderGoogleSignInButton as (
    element: HTMLElement,
    options: ButtonOptions
  ) => () => void;
}

const b64url = (s: string) =>
  Buffer.from(s)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

export const makeJwt = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.signature`;

export const farFutureExp = Math.floor(Date.now() / 1000) + 3600;

/**
 * Let the stubbed script `onload` and every chained promise settle.
 *
 * Deliberately a macrotask: it drains the whole microtask queue, so tests do not
 * encode how many `await`s deep the implementation happens to be.
 */
export const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0));

/** Invoke the credential callback passed to the most recent `initialize` call. */
export function fireCredential(jwt: string) {
  const calls = initializeFn.mock.calls;
  const initCall = calls[calls.length - 1];
  const config = initCall?.[0] as { callback: (r: { credential: string }) => void };
  config.callback({ credential: jwt });
}

type TokenClientConfig = {
  callback: (r: Record<string, unknown>) => void;
  error_callback?: (e: Record<string, unknown>) => void;
};

const lastTokenClientConfig = (): TokenClientConfig => {
  const calls = initTokenClientFn.mock.calls;
  return calls[calls.length - 1]?.[0] as TokenClientConfig;
};

/** Deliver a token response to the most recent token client. */
export function fireTokenResponse(response: Record<string, unknown>) {
  lastTokenClientConfig().callback(response);
}

/** Deliver a non-OAuth failure (popup blocked/closed) to the token client. */
export function fireTokenError(error: Record<string, unknown>) {
  lastTokenClientConfig().error_callback?.(error);
}

/** Invoke the listener passed to the most recent `prompt` call. */
export function fireMoment(builder: (n: Record<string, unknown>) => void) {
  const calls = promptFn.mock.calls;
  const promptCall = calls[calls.length - 1];
  const listener = promptCall?.[0] as (n: Record<string, unknown>) => void;
  const notification: Record<string, unknown> = {
    isDismissedMoment: () => false,
  };
  builder(notification);
  listener(notification);
}
