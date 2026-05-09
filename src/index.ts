import NativeModule from './ExpoGoogleSigninModule';
import { mapNativeError } from './errors';
import type { ConfigureOptions, SignInOptions, SignInResult } from './types';

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

export const signIn = async (options: SignInOptions = {}): Promise<SignInResult> => {
  try {
    return await NativeModule.signIn(options);
  } catch (e) {
    throw mapNativeError(e);
  }
};

export const getCurrentUser = async (): Promise<SignInResult | null> => {
  try {
    return await NativeModule.getCurrentUser();
  } catch (e) {
    throw mapNativeError(e);
  }
};
