/**
 * @jest-environment jsdom
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';

const initializeFn = jest.fn();
const promptFn = jest.fn();
const disableAutoSelectFn = jest.fn();

let appendSpy: jest.SpyInstance;
let injectedScript: HTMLScriptElement | undefined;

function installGisGlobal() {
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: initializeFn,
        prompt: promptFn,
        disableAutoSelect: disableAutoSelectFn,
      },
    },
  };
}

beforeEach(() => {
  jest.resetModules();
  initializeFn.mockReset();
  promptFn.mockReset();
  disableAutoSelectFn.mockReset();
  sessionStorage.clear();
  delete (window as unknown as { google?: unknown }).google;
  injectedScript = undefined;
  appendSpy = jest
    .spyOn(document.head, 'appendChild')
    .mockImplementation((node) => {
      if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
        injectedScript = node;
        queueMicrotask(() => {
          installGisGlobal();
          node.onload?.(new Event('load'));
        });
      }
      return node;
    });
});

afterEach(() => {
  appendSpy.mockRestore();
});

function loadModule() {
  return require('../ExpoGoogleSigninModule.web').default as {
    configure: (opts: { webClientId: string; iosClientId?: string; hostedDomain?: string }) => void;
    signIn: (opts: { nonce?: string }) => Promise<{ idToken: string; user: unknown }>;
    signOut: () => Promise<void>;
    getCurrentUser: () => Promise<{ idToken: string; user: unknown } | null>;
  };
}

describe('configure', () => {
  it('injects the GIS script tag on first call', () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    expect(appendSpy).toHaveBeenCalled();
    expect(injectedScript?.src).toBe(GIS_URL);
    expect(injectedScript?.async).toBe(true);
    expect(injectedScript?.defer).toBe(true);
  });

  it('does not inject a second script on repeated calls', () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });
});
