import { requireNativeModule } from 'expo-modules-core';
import { GoogleSigninError } from './errors';
import type {
  AuthorizationResult,
  AuthorizeOptions,
  ConfigureOptions,
  SignInButtonOptions,
  SignInOptions,
  SignInResult,
} from './types';

type NativeModule = {
  configure(options: ConfigureOptions): void;
  signIn(options: SignInOptions): Promise<SignInResult>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<SignInResult | null>;
  authorize(options: AuthorizeOptions): Promise<AuthorizationResult>;
};

export const renderGoogleSignInButton = (
  _element: HTMLElement,
  _options: SignInButtonOptions
): (() => void) => {
  throw new GoogleSigninError(
    'ERR_UNKNOWN',
    'renderGoogleSignInButton is web-only — use signIn() on native'
  );
};

export default requireNativeModule<NativeModule>('ExpoGoogleSignin');
