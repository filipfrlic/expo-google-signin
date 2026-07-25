/**
 * @jest-environment jsdom
 */

import {
  GIS_URL,
  SESSION_KEY,
  disableAutoSelectFn,
  farFutureExp,
  fireCredential,
  fireMoment,
  flushAsync,
  harness,
  initializeFn,
  loadModule,
  makeJwt,
  promptFn,
  setupGisHarness,
  simulateGisLoadFailure,
} from './helpers/gisHarness';

setupGisHarness();

describe('configure', () => {
  it('injects the GIS script tag on first call', () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    expect(harness.appendSpy).toHaveBeenCalled();
    expect(harness.injectedScript?.src).toBe(GIS_URL);
    expect(harness.injectedScript?.async).toBe(true);
    expect(harness.injectedScript?.defer).toBe(true);
  });

  it('does not inject a second script on repeated calls', () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    expect(harness.appendSpy).toHaveBeenCalledTimes(1);
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
    await flushAsync();
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
    await flushAsync();
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'hashed-nonce-abc' })
    );
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
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
    await flushAsync();
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
    await flushAsync();
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
    await flushAsync();
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
    await flushAsync();
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
    await flushAsync();
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
    await flushAsync();
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@other.com', hd: 'other.com', exp: farFutureExp })
    );
    await expect(pending).rejects.toMatchObject({ code: 'ERR_NO_CREDENTIAL' });
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('resolves when hostedDomain matches', async () => {
    const mod = loadModule();
    mod.configure({
      webClientId: 'web.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
    const pending = mod.signIn({});
    await flushAsync();
    fireCredential(
      makeJwt({ sub: 'x', email: 'y@example.com', hd: 'example.com', exp: farFutureExp })
    );
    await expect(pending).resolves.toMatchObject({ idToken: expect.any(String) });
  });

  it('rejects with ERR_NETWORK when the GIS script fails to load', async () => {
    simulateGisLoadFailure();

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
    await flushAsync();
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    await pending;
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull();

    await mod.signOut();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
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
    await flushAsync();
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
      SESSION_KEY,
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
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
