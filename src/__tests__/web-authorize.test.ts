/**
 * @jest-environment jsdom
 */

import {
  fireTokenError,
  fireTokenResponse,
  flushAsync,
  initTokenClientFn,
  loadModule,
  requestAccessTokenFn,
  setupGisHarness,
  simulateGisLoadFailure,
} from './helpers/gisHarness';

setupGisHarness();

const DRIVE = 'https://www.googleapis.com/auth/drive.readonly';
const CALENDAR = 'https://www.googleapis.com/auth/calendar.readonly';

const configured = () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  return mod;
};

describe('authorize', () => {
  it('resolves with accessToken, grantedScopes, and expiresAt', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    const before = Date.now();
    fireTokenResponse({ access_token: 'ya29.token', expires_in: 3600, scope: DRIVE });
    const result = await pending;

    expect(result.accessToken).toBe('ya29.token');
    expect(result.grantedScopes).toEqual([DRIVE]);
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  it('passes the client id and space-delimited scopes to initTokenClient', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE, CALENDAR] });
    await flushAsync();

    expect(initTokenClientFn).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'web.apps.googleusercontent.com',
        scope: `${DRIVE} ${CALENDAR}`,
      })
    );
    expect(requestAccessTokenFn).toHaveBeenCalled();

    fireTokenResponse({ access_token: 't', expires_in: 60, scope: DRIVE });
    await pending;
  });

  it('forwards hostedDomain as the hd hint', async () => {
    const mod = loadModule();
    mod.configure({
      webClientId: 'web.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    expect(initTokenClientFn).toHaveBeenCalledWith(
      expect.objectContaining({ hd: 'example.com' })
    );

    fireTokenResponse({ access_token: 't', expires_in: 60, scope: DRIVE });
    await pending;
  });

  it('reports only the scopes the user actually granted', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE, CALENDAR] });
    await flushAsync();

    // Granular consent: user approved Drive but refused Calendar.
    fireTokenResponse({ access_token: 't', expires_in: 3600, scope: DRIVE });
    const result = await pending;

    expect(result.grantedScopes).toEqual([DRIVE]);
    expect(result.grantedScopes).not.toContain(CALENDAR);
  });

  it('returns expiresAt null when the response omits expires_in', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenResponse({ access_token: 't', scope: DRIVE });
    await expect(pending).resolves.toMatchObject({ expiresAt: null });
  });

  it('rejects with ERR_NOT_CONFIGURED when configure() was not called', async () => {
    const mod = loadModule();
    await expect(mod.authorize({ scopes: [DRIVE] })).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_NOT_CONFIGURED',
    });
  });

  it('rejects with ERR_UNKNOWN when no scopes are passed', async () => {
    const mod = configured();
    await expect(mod.authorize({ scopes: [] })).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_UNKNOWN',
    });
    expect(initTokenClientFn).not.toHaveBeenCalled();
  });

  it('rejects with ERR_SIGN_IN_CANCELLED when the user denies consent', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenResponse({ error: 'access_denied', error_description: 'user denied' });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_SIGN_IN_CANCELLED' });
  });

  it('rejects with ERR_SIGN_IN_CANCELLED when the popup is closed', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenError({ type: 'popup_closed', message: 'closed' });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_SIGN_IN_CANCELLED' });
  });

  it('rejects with ERR_NETWORK when the popup is blocked', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenError({ type: 'popup_failed_to_open' });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('rejects with ERR_UNKNOWN for a non-consent OAuth error', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenResponse({ error: 'invalid_scope', error_description: 'bad scope' });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_UNKNOWN' });
  });

  it('rejects with ERR_UNKNOWN when the response carries no access token', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenResponse({ expires_in: 3600, scope: DRIVE });
    await expect(pending).rejects.toMatchObject({ code: 'ERR_UNKNOWN' });
  });

  it('rejects with ERR_NETWORK when the GIS script fails to load', async () => {
    simulateGisLoadFailure();
    const mod = configured();
    await expect(mod.authorize({ scopes: [DRIVE] })).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
  });

  it('ignores a late second callback after the first settles', async () => {
    const mod = configured();
    const pending = mod.authorize({ scopes: [DRIVE] });
    await flushAsync();

    fireTokenResponse({ access_token: 'first', expires_in: 3600, scope: DRIVE });
    fireTokenResponse({ error: 'access_denied' });

    await expect(pending).resolves.toMatchObject({ accessToken: 'first' });
  });
});
