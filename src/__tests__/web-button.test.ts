/**
 * @jest-environment jsdom
 */

import {
  SESSION_KEY,
  farFutureExp,
  fireCredential,
  flushAsync,
  initializeFn,
  loadButton,
  loadModule,
  makeJwt,
  renderButtonFn,
  setupGisHarness,
  simulateGisLoadFailure,
} from './helpers/gisHarness';

setupGisHarness();

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
    await flushAsync();
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
    await flushAsync();
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
    await flushAsync();
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@other.com', hd: 'other.com', exp: farFutureExp })
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GoogleSigninError', code: 'ERR_NO_CREDENTIAL' })
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('forwards nonce to google.accounts.id.initialize', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    renderGoogleSignInButton(document.createElement('div'), {
      onSuccess: jest.fn(),
      nonce: 'hashed-nonce-xyz',
    });
    await flushAsync();
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce-xyz' })
    );
  });

  it('fires onError with ERR_NETWORK when the GIS script fails to load', async () => {
    simulateGisLoadFailure();
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
    await flushAsync();
    const jwt = makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp });
    fireCredential(jwt);
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();
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
    await flushAsync();
    unmount();
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('renderGoogleSignInButton: GIS takeover', () => {
  it('fires onError when a later signIn re-initializes GIS', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const onSuccess = jest.fn();
    const onError = jest.fn();
    renderGoogleSignInButton(document.createElement('div'), { onSuccess, onError });
    await flushAsync();

    const pending = mod.signIn({});
    await flushAsync();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'GoogleSigninError', code: 'ERR_UNKNOWN' })
    );

    // The credential now belongs to signIn, not the superseded button.
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    await expect(pending).resolves.toMatchObject({ user: { id: 'x' } });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not supersede a live button when an unrelated unmount runs', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const renderGoogleSignInButton = loadButton();
    const first = renderGoogleSignInButton(document.createElement('div'), {
      onSuccess: jest.fn(),
    });
    await flushAsync();

    const onSuccess = jest.fn();
    renderGoogleSignInButton(document.createElement('div'), { onSuccess });
    await flushAsync();

    // Unmounting the superseded first button must not detach the second.
    first();
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    expect(onSuccess).toHaveBeenCalled();
  });
});
