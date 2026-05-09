import NativeModule from './ExpoGoogleSigninModule';
import { mapNativeError } from './errors';
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

export const signOut = async (): Promise<void> => {
  try {
    await NativeModule.signOut();
  } catch (e) {
    throw mapNativeError(e);
  }
};
