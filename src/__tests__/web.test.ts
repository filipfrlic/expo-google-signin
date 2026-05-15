/**
 * @jest-environment jsdom
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';

const initializeFn = jest.fn();
const promptFn = jest.fn();
const renderButtonFn = jest.fn();
const disableAutoSelectFn = jest.fn();

let appendSpy: jest.SpyInstance;
let injectedScript: HTMLScriptElement | undefined;

function installGisGlobal() {
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: initializeFn,
        prompt: promptFn,
        renderButton: renderButtonFn,
        disableAutoSelect: disableAutoSelectFn,
      },
    },
  };
}

beforeEach(() => {
  jest.resetModules();
  initializeFn.mockReset();
  promptFn.mockReset();
  renderButtonFn.mockReset();
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

type ButtonSuccess = { idToken: string; user: unknown };
type ButtonOptions = {
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

function loadButton() {
  return require('../ExpoGoogleSigninModule.web').renderGoogleSignInButton as (
    element: HTMLElement,
    options: ButtonOptions
  ) => () => void;
}

const b64url = (s: string) =>
  Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const makeJwt = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.signature`;

const farFutureExp = Math.floor(Date.now() / 1000) + 3600;

function fireCredential(jwt: string) {
  const calls = initializeFn.mock.calls;
  const initCall = calls[calls.length - 1];
  const config = initCall?.[0] as { callback: (r: { credential: string }) => void };
  config.callback({ credential: jwt });
}

function fireMoment(builder: (n: Record<string, unknown>) => void) {
  const calls = promptFn.mock.calls;
  const promptCall = calls[calls.length - 1];
  const listener = promptCall?.[0] as (n: Record<string, unknown>) => void;
  const notification: Record<string, unknown> = {
    isDismissedMoment: () => false,
  };
  builder(notification);
  listener(notification);
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

describe('signIn', () => {
  it('resolves with idToken and decoded user on credential callback', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const jwt = makeJwt({
      sub: 'user-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
      given_name: 'Jane',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      exp: farFutureExp,
    });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(jwt);
    const result = await pending;
    expect(result.idToken).toBe(jwt);
    expect(result.user).toEqual({
      id: 'user-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
      givenName: 'Jane',
      familyName: 'Doe',
      photo: 'https://lh3.googleusercontent.com/a/photo',
    });
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'web.apps.googleusercontent.com',
        use_fedcm_for_prompt: true,
        auto_select: false,
      })
    );
    expect(promptFn).toHaveBeenCalled();
  });

  it('forwards nonce to google.accounts.id.initialize', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({ nonce: 'hashed-nonce-abc' });
    await new Promise<void>((r) => queueMicrotask(r));
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce-abc' })
    );
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp })
    );
    await pending;
  });

  it('rejects with ERR_NOT_CONFIGURED when configure() was not called', async () => {
    const mod = loadModule();
    await expect(mod.signIn({})).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_NOT_CONFIGURED',
    });
  });

  it('rejects with ERR_SIGN_IN_CANCELLED when prompt is dismissed via cancel_called', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireMoment((n) => {
      n.isDismissedMoment = () => true;
      n.getDismissedReason = () => 'cancel_called';
    });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_SIGN_IN_CANCELLED' });
  });

  it('rejects with ERR_SIGN_IN_CANCELLED when prompt is dismissed via user_cancel', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireMoment((n) => {
      n.isDismissedMoment = () => true;
      n.getDismissedReason = () => 'user_cancel';
    });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_SIGN_IN_CANCELLED' });
  });

  it('rejects with ERR_UNKNOWN for unrecognized dismissal reasons', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireMoment((n) => {
      n.isDismissedMoment = () => true;
      n.getDismissedReason = () => 'something_weird';
    });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_UNKNOWN' });
  });

  it('ignores the flow_restarted dismissal moment', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireMoment((n) => {
      n.isDismissedMoment = () => true;
      n.getDismissedReason = () => 'flow_restarted';
    });
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    await expect(pending).resolves.toMatchObject({ idToken: expect.any(String) });
  });

  it('ignores the credential_returned dismissal moment after credential resolves', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    fireMoment((n) => {
      n.isDismissedMoment = () => true;
      n.getDismissedReason = () => 'credential_returned';
    });
    await expect(pending).resolves.toMatchObject({ idToken: expect.any(String) });
  });

  it('rejects with ERR_NO_CREDENTIAL when hostedDomain does not match the hd claim', async () => {
    const mod = loadModule();
    mod.configure({
      webClientId: 'web.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@other.com', hd: 'other.com', exp: farFutureExp })
    );
    await expect(pending).rejects.toMatchObject({ code: 'ERR_NO_CREDENTIAL' });
    expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
  });

  it('resolves when hostedDomain matches', async () => {
    const mod = loadModule();
    mod.configure({
      webClientId: 'web.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@example.com', hd: 'example.com', exp: farFutureExp })
    );
    await expect(pending).resolves.toMatchObject({ idToken: expect.any(String) });
  });

  it('rejects with ERR_NETWORK when the GIS script fails to load', async () => {
    appendSpy.mockReset();
    appendSpy.mockImplementation((node) => {
      if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
        queueMicrotask(() => node.onerror?.(new Event('error')));
      }
      return node;
    });

    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    await expect(mod.signIn({})).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_NETWORK',
    });
  });
});

describe('signOut', () => {
  it('clears the cached session and calls disableAutoSelect', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    await pending;
    expect(sessionStorage.getItem('expo-google-signin:session')).not.toBeNull();

    await mod.signOut();
    expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
    expect(disableAutoSelectFn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when GIS has not loaded yet', async () => {
    const mod = loadModule();
    await expect(mod.signOut()).resolves.toBeUndefined();
    expect(disableAutoSelectFn).not.toHaveBeenCalled();
  });
});

describe('getCurrentUser', () => {
  it('returns the cached session after a successful signIn', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    const jwt = makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp });
    fireCredential(jwt);
    const signed = await pending;

    const current = await mod.getCurrentUser();
    expect(current).toEqual(signed);
  });

  it('returns null when no session is cached', async () => {
    const mod = loadModule();
    await expect(mod.getCurrentUser()).resolves.toBeNull();
  });

  it('returns null and clears storage when the cached token has expired', async () => {
    const expiredJwt = makeJwt({
      sub: 'x',
      email: 'y@z.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    sessionStorage.setItem(
      'expo-google-signin:session',
      JSON.stringify({
        idToken: expiredJwt,
        user: {
          id: 'x',
          email: 'y@z.com',
          name: null,
          givenName: null,
          familyName: null,
          photo: null,
        },
      })
    );
    const mod = loadModule();
    await expect(mod.getCurrentUser()).resolves.toBeNull();
    expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
  });
});

describe('renderGoogleSignInButton', () => {
  it('throws ERR_NOT_CONFIGURED synchronously when configure() was not called', () => {
    const renderGoogleSignInButton = loadButton();
    const element = document.createElement('div');
    expect(() => renderGoogleSignInButton(element, { onSuccess: jest.fn() })).toThrow(
      expect.objectContaining({ name: 'GoogleSigninError', code: 'ERR_NOT_CONFIGURED' })
    );
  });

  it('calls google.accounts.id.renderButton with the passed styling options', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const element = document.createElement('div');
    renderGoogleSignInButton(element, {
      onSuccess: jest.fn(),
      theme: 'filled_blue',
      size: 'medium',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'center',
      width: 240,
    });
    await new Promise<void>((r) => queueMicrotask(r));
    expect(renderButtonFn).toHaveBeenCalledWith(
      element,
      expect.objectContaining({
        theme: 'filled_blue',
        size: 'medium',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'center',
        width: 240,
      })
    );
  });

  it('fires onSuccess with the decoded SignInResult on credential callback', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const onSuccess = jest.fn();
    const onError = jest.fn();
    renderGoogleSignInButton(document.createElement('div'), { onSuccess, onError });
    await new Promise<void>((r) => queueMicrotask(r));
    const jwt = makeJwt({
      sub: 'user-42',
      email: 'a@b.com',
      name: 'Alice',
      given_name: 'Alice',
      family_name: 'Smith',
      picture: 'https://example.com/p.png',
      exp: farFutureExp,
    });
    fireCredential(jwt);
    expect(onSuccess).toHaveBeenCalledWith({
      idToken: jwt,
      user: {
        id: 'user-42',
        email: 'a@b.com',
        name: 'Alice',
        givenName: 'Alice',
        familyName: 'Smith',
        photo: 'https://example.com/p.png',
      },
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('fires onError with ERR_NO_CREDENTIAL and skips cache on hostedDomain mismatch', async () => {
    const mod = loadModule();
    mod.configure({
      webClientId: 'web.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
    const renderGoogleSignInButton = loadButton();
    const onSuccess = jest.fn();
    const onError = jest.fn();
    renderGoogleSignInButton(document.createElement('div'), { onSuccess, onError });
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@other.com', hd: 'other.com', exp: farFutureExp })
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GoogleSigninError', code: 'ERR_NO_CREDENTIAL' })
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
  });

  it('forwards nonce to google.accounts.id.initialize', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    renderGoogleSignInButton(document.createElement('div'), {
      onSuccess: jest.fn(),
      nonce: 'hashed-nonce-xyz',
    });
    await new Promise<void>((r) => queueMicrotask(r));
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce-xyz' })
    );
  });

  it('fires onError with ERR_NETWORK when the GIS script fails to load', async () => {
    appendSpy.mockReset();
    appendSpy.mockImplementation((node) => {
      if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
        queueMicrotask(() => node.onerror?.(new Event('error')));
      }
      return node;
    });
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const onError = jest.fn();
    renderGoogleSignInButton(document.createElement('div'), {
      onSuccess: jest.fn(),
      onError,
    });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GoogleSigninError', code: 'ERR_NETWORK' })
    );
  });

  it('writes successful result to sessionStorage so getCurrentUser() returns it', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    renderGoogleSignInButton(document.createElement('div'), { onSuccess: jest.fn() });
    await new Promise<void>((r) => queueMicrotask(r));
    const jwt = makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp });
    fireCredential(jwt);
    expect(sessionStorage.getItem('expo-google-signin:session')).not.toBeNull();
    const current = await mod.getCurrentUser();
    expect(current?.idToken).toBe(jwt);
  });

  it('returned unmount function clears the element', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const element = document.createElement('div');
    element.appendChild(document.createElement('span'));
    const unmount = renderGoogleSignInButton(element, { onSuccess: jest.fn() });
    expect(element.children.length).toBe(1);
    unmount();
    expect(element.children.length).toBe(0);
  });

  it('does not call onSuccess after unmount even if the credential callback fires later', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const onSuccess = jest.fn();
    const unmount = renderGoogleSignInButton(document.createElement('div'), { onSuccess });
    await new Promise<void>((r) => queueMicrotask(r));
    unmount();
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
