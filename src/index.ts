import NativeModule from './ExpoGoogleSigninModule';
import type { ConfigureOptions } from './types';

export type {
  GoogleUser,
  SignInResult,
  ConfigureOptions,
  SignInOptions,
  ErrorCode,
} from './types';

export { GoogleSigninError } from './errors';

export const configure = (options: ConfigureOptions): void => {
  if (!options || !options.webClientId) {
    throw new Error('expo-google-signin: configure() requires a webClientId');
  }
  NativeModule.configure(options);
};
