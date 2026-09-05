/**
 * Profile fields for the signed-in account.
 *
 * **Display data, not proof of identity.** On Android and web these are decoded
 * out of the ID token's payload *without verifying its signature*, which no
 * client can do on its own. Treat them as what to render — never as the basis
 * for granting access. Anything that matters must be decided by your backend
 * after it verifies {@link SignInResult.idToken} against Google's public keys
 * and checks the `aud` claim, and it should read identity from the verified
 * claims rather than from anything the client sends alongside the token.
 */
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
  /**
   * OIDC ID token (JWT). The only signed artifact here, and the only thing
   * worth sending to your backend — verify it there, then read identity from
   * the verified claims.
   */
  idToken: string;
  /** Decoded profile fields. Safe to render; see {@link GoogleUser}. */
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
   *
   * `getCurrentUser()` re-checks the restored token's `hd` claim on every
   * platform, so a session cached before this option was set — or under a
   * different domain — resolves to `null` rather than coming back. As with
   * every client-side check, it filters; it does not authenticate. Verify `hd`
   * on your backend too.
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

export type AuthorizeOptions = {
  /**
   * Required. OAuth scopes to request, as full URLs — e.g.
   * `https://www.googleapis.com/auth/drive.readonly`. Must be non-empty.
   */
  scopes: string[];
};

/**
 * The result of {@link AuthorizeOptions}.
 *
 * **Which account granted this token is only guaranteed on iOS and Android.**
 * There, consent is pinned to the account that signed in — iOS operates on the
 * current user, and Android pins the request to that account and rejects with
 * `ERR_NO_CREDENTIAL` rather than authorizing an unpinned one. On web, GIS
 * `login_hint` is a *hint*: the user can still switch accounts inside the
 * popup, and the token response carries no account, so the browser cannot tell
 * you which one granted it. If that distinction matters to your app, confirm it
 * server-side — call Google's `tokeninfo`/`userinfo` endpoint with the access
 * token and compare its `sub` against the verified ID token's `sub`.
 */
export type AuthorizationResult = {
  /** OAuth 2.0 access token. Send as `Authorization: Bearer <token>`. */
  accessToken: string;
  /**
   * Scopes the user actually granted. Google supports granular consent, so this
   * may be a **subset** of the requested scopes — check it before calling an API
   * rather than assuming the whole request was approved.
   */
  grantedScopes: string[];
  /**
   * Expiry as epoch milliseconds, or `null` when the platform does not report
   * one. Android's `AuthorizationResult` exposes no expiry, so it is always
   * `null` there; iOS and web report a real value. Treat `null` as "unknown" and
   * re-authorize when an API call returns 401.
   */
  expiresAt: number | null;
};

/**
 * Options for {@link renderGoogleSignInButton}. Web-only — calling the function
 * on iOS or Android throws synchronously.
 *
 * Google Identity Services allows one active consumer per page, so a rendered
 * button and an in-flight `signIn()` cannot coexist: whichever starts last
 * takes over, and the other is handed an `ERR_UNKNOWN` through `onError` (or a
 * rejected promise) instead of being left waiting forever. Render the button or
 * call `signIn()` — not both at once.
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
