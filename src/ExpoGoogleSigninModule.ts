import { requireNativeModule } from 'expo-modules-core';
import type { ConfigureOptions, SignInOptions, SignInResult } from './types';

type NativeModule = {
  configure(options: ConfigureOptions): void;
  signIn(options: SignInOptions): Promise<SignInResult>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<SignInResult | null>;
};

export default requireNativeModule<NativeModule>('ExpoGoogleSignin');
