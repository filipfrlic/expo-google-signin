jest.mock('../ExpoGoogleSigninModule', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

import NativeModule from '../ExpoGoogleSigninModule';
import { configure } from '../index';

const native = NativeModule as unknown as {
  configure: jest.Mock;
  signIn: jest.Mock;
  signOut: jest.Mock;
  getCurrentUser: jest.Mock;
};

beforeEach(() => {
  native.configure.mockReset();
  native.signIn.mockReset();
  native.signOut.mockReset();
  native.getCurrentUser.mockReset();
});

describe('configure', () => {
  it('forwards options to the native module', () => {
    configure({
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: 'ios.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
    expect(native.configure).toHaveBeenCalledWith({
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: 'ios.apps.googleusercontent.com',
      hostedDomain: 'example.com',
    });
  });

  it('throws if webClientId is missing', () => {
    // @ts-expect-error testing runtime guard
    expect(() => configure({})).toThrow(/webClientId/);
  });
});

import { signOut } from '../index';

describe('signOut', () => {
  it('calls the native module', async () => {
    native.signOut.mockResolvedValueOnce(undefined);
    await signOut();
    expect(native.signOut).toHaveBeenCalledTimes(1);
  });

  it('maps native errors to GoogleSigninError', async () => {
    native.signOut.mockRejectedValueOnce({ code: 'ERR_UNKNOWN', message: 'boom' });
    await expect(signOut()).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_UNKNOWN',
      message: 'boom',
    });
  });
});

import { signIn } from '../index';

const fakeUser = {
  id: '1234567890',
  email: 'jane@example.com',
  name: 'Jane Doe',
  givenName: 'Jane',
  familyName: 'Doe',
  photo: 'https://lh3.googleusercontent.com/a/photo',
};

describe('signIn', () => {
  it('returns idToken + user from the native module', async () => {
    native.signIn.mockResolvedValueOnce({ idToken: 'jwt.token', user: fakeUser });
    const result = await signIn();
    expect(result.idToken).toBe('jwt.token');
    expect(result.user).toEqual(fakeUser);
    expect(native.signIn).toHaveBeenCalledWith({});
  });

  it('forwards nonce when provided', async () => {
    native.signIn.mockResolvedValueOnce({ idToken: 'jwt.token', user: fakeUser });
    await signIn({ nonce: 'abc123' });
    expect(native.signIn).toHaveBeenCalledWith({ nonce: 'abc123' });
  });

  it('maps cancellation to ERR_SIGN_IN_CANCELLED', async () => {
    native.signIn.mockRejectedValueOnce({
      code: 'ERR_SIGN_IN_CANCELLED',
      message: 'user cancelled',
    });
    await expect(signIn()).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_SIGN_IN_CANCELLED',
    });
  });
});

import { getCurrentUser } from '../index';

describe('getCurrentUser', () => {
  it('returns null when no cached user exists', async () => {
    native.getCurrentUser.mockResolvedValueOnce(null);
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });

  it('returns the user when one exists', async () => {
    native.getCurrentUser.mockResolvedValueOnce({ idToken: 'jwt', user: fakeUser });
    const result = await getCurrentUser();
    expect(result).toEqual({ idToken: 'jwt', user: fakeUser });
  });

  it('maps native errors to GoogleSigninError', async () => {
    native.getCurrentUser.mockRejectedValueOnce({ code: 'ERR_UNKNOWN', message: 'boom' });
    await expect(getCurrentUser()).rejects.toMatchObject({
      name: 'GoogleSigninError',
      code: 'ERR_UNKNOWN',
    });
  });
});
