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
