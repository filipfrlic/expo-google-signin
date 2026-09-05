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

/**
 * Clear the local session.
 *
 * This does not **revoke** anything: an access token already handed out by
 * {@link authorize} stays valid at Google until it expires (about an hour), on
 * every platform. If you need it dead immediately — a shared device, a "revoke
 * access" affordance — call Google's `/revoke` endpoint from your backend as
 * well.
 */
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
 * Call `signIn()` first — iOS and Android reject with `ERR_NO_CREDENTIAL`
 * without a signed-in account to pin consent to. On web this opens a popup, so
 * it must be invoked from a user gesture (a click handler) or the browser will
 * block it. See {@link AuthorizationResult} for what "pinned" guarantees per
 * platform.
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
