export type GoogleUser = {
  /**
   * Stable Google account identifier (the OIDC `sub` claim).
   *
   * On iOS this is always `GIDGoogleUser.userID`. On Android and web this is
   * decoded from the ID token's `sub` claim; on Android, if decoding fails
   * (malformed JWT — extremely rare), it falls back to the email address,
   * which is stable but not the canonical sub.
   */
  id: string;
  email: string;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
  /** Profile picture URL, sized at the platform default. */
  photo: string | null;
};

export type SignInResult = {
  /** OIDC ID token (JWT). Send to your backend for verification. */
  idToken: string;
  user: GoogleUser;
};

export type ConfigureOptions = {
  /**
   * Required. The OAuth 2.0 *web* client ID used to mint cross-platform ID tokens.
   * Used on every platform — Android and iOS both pass it to their native SDKs,
   * and web initializes Google Identity Services with it.
   */
  webClientId: string;
  /**
   * iOS only. Ignored on Android and web. Falls back to `CLIENT_ID` from a
   * bundled `GoogleService-Info.plist` when omitted.
   */
  iosClientId?: string;
  /**
   * Optional. Restrict sign-in to a specific Google Workspace hosted domain.
   * Enforced by the native SDK on iOS and Android. On web, GIS does not
   * pre-filter — the returned token's `hd` claim is checked after sign-in and
   * mismatches reject with `ERR_NO_CREDENTIAL`.
   */
  hostedDomain?: string;
};

export type SignInOptions = {
  /**
   * Hashed nonce (SHA-256 hex of a server-generated raw nonce). Embeds in the
   * resulting ID token's `nonce` claim. Required by some backends (e.g. Supabase).
   * Behaves identically on all platforms.
   */
  nonce?: string;
};

/**
 * Options for {@link renderGoogleSignInButton}. Web-only — calling the function
 * on iOS or Android throws synchronously.
 */
export type SignInButtonOptions = {
  /** Required. Fires with `{ idToken, user }` when the user signs in successfully. */
  onSuccess: (result: SignInResult) => void;
  /** Optional. Fires on decode failure, hostedDomain mismatch, or script load failure. */
  onError?: (error: import('./errors').GoogleSigninError) => void;
  /** Hashed nonce; same semantics as {@link SignInOptions.nonce}. */
  nonce?: string;
  /** GIS button theme. Default `outline`. */
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  /** GIS button size. Default `large`. */
  size?: 'large' | 'medium' | 'small';
  /** GIS button text. Default `signin_with`. */
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  /** GIS button shape. Default `rectangular`. */
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  /** Logo alignment. Default `left`. */
  logo_alignment?: 'left' | 'center';
  /** Button width in pixels (max 400). */
  width?: number;
};

/**
 * Stable error codes set on {@link GoogleSigninError.code}. Branch on `code`
 * rather than `instanceof` — module realms can break the prototype chain.
 *
 * Platform notes:
 * - `ERR_PLAY_SERVICES_UNAVAILABLE` is Android-only; never emitted on iOS or web.
 * - `ERR_NETWORK` also covers GIS script load failures on web.
 * - All other codes can be emitted on every platform.
 */
export type ErrorCode =
  | 'ERR_SIGN_IN_CANCELLED'
  | 'ERR_NO_CREDENTIAL'
  | 'ERR_PLAY_SERVICES_UNAVAILABLE'
  | 'ERR_NETWORK'
  | 'ERR_NOT_CONFIGURED'
  | 'ERR_UNKNOWN';
