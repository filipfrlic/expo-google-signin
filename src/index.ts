import NativeModule from './ExpoGoogleSigninModule';
import { GoogleSigninError, mapNativeError } from './errors';
import type {
  AuthorizationResult,
  AuthorizeOptions,
  ConfigureOptions,
  SignInOptions,
  SignInResult,
} from './types';

export type {
  GoogleUser,
  SignInResult,
  ConfigureOptions,
  SignInOptions,
  SignInButtonOptions,
  AuthorizeOptions,
  AuthorizationResult,
  ErrorCode,
} from './types';

export { GoogleSigninError } from './errors';
export { renderGoogleSignInButton } from './ExpoGoogleSigninModule';

export const configure = (options: ConfigureOptions): void => {
  if (!options || !options.webClientId) {
    throw new GoogleSigninError(
      'ERR_NOT_CONFIGURED',
      'configure() requires a webClientId'
    );
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

/**
 * Request OAuth scopes and an access token for calling Google APIs.
 *
 * Call `signIn()` first. On web this opens a popup, so it must be invoked from a
 * user gesture (a click handler) or the browser will block it.
 */
export const authorize = async (
  options: AuthorizeOptions
): Promise<AuthorizationResult> => {
  if (!options || !options.scopes || options.scopes.length === 0) {
    throw new GoogleSigninError(
      'ERR_UNKNOWN',
      'authorize() requires at least one scope'
    );
  }
  try {
    return await NativeModule.authorize(options);
  } catch (e) {
    throw mapNativeError(e);
  }
};
