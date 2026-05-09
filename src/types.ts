export type GoogleUser = {
  /** Stable Google account identifier (the OIDC `sub` claim). */
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
  /** Required. The OAuth 2.0 *web* client ID used to mint cross-platform ID tokens. */
  webClientId: string;
  /** iOS only. Falls back to `CLIENT_ID` from a bundled `GoogleService-Info.plist`. */
  iosClientId?: string;
  /** Optional. Restrict sign-in to a specific Google Workspace hosted domain. */
  hostedDomain?: string;
};

export type SignInOptions = {
  /**
   * Hashed nonce (SHA-256 hex of a server-generated raw nonce). Embeds in the
   * resulting ID token's `nonce` claim. Required by some backends (e.g. Supabase).
   */
  nonce?: string;
};

export type ErrorCode =
  | 'ERR_SIGN_IN_CANCELLED'
  | 'ERR_NO_CREDENTIAL'
  | 'ERR_PLAY_SERVICES_UNAVAILABLE'
  | 'ERR_NETWORK'
  | 'ERR_NOT_CONFIGURED'
  | 'ERR_UNKNOWN';
