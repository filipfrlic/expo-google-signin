# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- iOS and Android: `getCurrentUser()` now re-applies the `hostedDomain` gate.
  Previously it was enforced only on a fresh `signIn()`, so a session restored
  from the keychain (iOS) or from Credential Manager (Android) came back with no
  domain check — an account that signed in before `hostedDomain` was configured
  stayed usable. A restored session whose ID token carries a non-matching `hd`
  claim now resolves to `null`. On Android the check reads the token's own
  claim, because `GetGoogleIdOption.Builder` has no `setHostedDomainFilter` and
  "previously authorized" does not imply "still in the domain".
- Android: `authorize()` no longer runs without an account pin. The pin lives in
  memory, so after a process restart it used to fall back to an account picker —
  which could return a token for a different account than `signIn()` did, with
  nothing in the result to reveal it. It now recovers the account silently from
  Credential Manager and refuses if it cannot, and cross-checks the account that
  actually granted (via `AuthorizationResult.toGoogleSignInAccount()`) against
  the pinned one.
- Web: `getCurrentUser()` re-applies the `hostedDomain` gate, and the cached
  `user` object is no longer trusted. Every profile field is re-derived from the
  cached ID token and the stored copy discarded, so a stale or tampered
  `sessionStorage` entry cannot present an identity the token does not back.
  `authorize()`'s `login_hint` now comes from the token for the same reason.

### Changed

- **Behavior:** `authorize()` on Android now rejects with `ERR_NO_CREDENTIAL`
  when no signed-in account can be established, matching what iOS already did,
  and with `ERR_NOT_CONFIGURED` when `configure()` was never called.
- **Behavior:** on web, starting a `signIn()` while a sign-in button is mounted
  (or vice versa) now fails the displaced one with `ERR_UNKNOWN` instead of
  leaving it pending forever. `google.accounts.id.initialize` is global, so the
  later caller takes over the credential callback; the earlier one is now told
  rather than left waiting for a credential that will be delivered elsewhere.

### Documentation

- New **Verifying on your backend** section, and an explicit warning that
  `SignInResult.user` is decoded from an *unverified* JWT payload — display
  data, not an authorization basis.
- `AuthorizationResult` now documents that the granting account is guaranteed
  only on iOS and Android; on web `login_hint` is a hint the user can override
  inside the popup, so apps that care must confirm it server-side.
- `signOut()` documents that it does not revoke already-issued access tokens.

### Internal

- Web `hostedDomain`/expiry/profile logic extracted to `src/web/session.ts`,
  shared by fresh sign-in and cache reads so the two cannot drift.

## [0.4.0] - 2026-07-25

### Added

- `authorize({ scopes })` — requests OAuth scopes and returns
  `{ accessToken, grantedScopes, expiresAt }` for calling Google APIs. Works on
  iOS, Android, and web.
  - `grantedScopes` may be a **subset** of the requested scopes; Google supports
    granular consent, so check it rather than assuming a full grant.
  - `expiresAt` is epoch milliseconds, or `null` when the platform reports no
    expiry — always `null` on Android, whose `AuthorizationResult` has no expiry
    field. The package stores no token state; call `authorize()` again to renew.
  - On web this opens a popup and must be called from a user gesture, otherwise
    the browser blocks it and it rejects with `ERR_NETWORK`.
  - Requires a prior `signIn()`; iOS rejects with `ERR_NO_CREDENTIAL` without one.
- `AuthorizeOptions` and `AuthorizationResult` types.
- `authorize()` pins consent to the signed-in account, so a multi-account device
  cannot grant scopes for a different account than `signIn()` returned. iOS acts
  on the current user, Android sets the account on the request, and web passes
  `login_hint`. The Android pin is in-memory: after a process restart it is unset
  until `signIn()` or `getCurrentUser()` repopulates it.
- A configured `hostedDomain` is now applied to the authorization request on
  Android (`filterByHostedDomain`) and web (`hd`), matching `signIn()`.
- Android dependency on `com.google.android.gms:play-services-auth`, which
  provides the `AuthorizationClient` that issues access tokens — Credential
  Manager returns ID tokens only.

### Fixed

- `ErrorCode` exhaustiveness check in `src/errors.ts` is now enforced. The type-level
  pin never actually failed a build — an unused type alias resolving to `never` raises
  no diagnostic — so a new error code could be added without a matching `KNOWN_CODES`
  entry, and `mapNativeError` would silently downgrade it to `ERR_UNKNOWN`.

### Changed

- Internal: `signIn` and `renderGoogleSignInButton` on web now share one
  `initializeGis` helper instead of repeating the Google Identity Services
  initialization options. No behavior change.
- Internal: split `src/__tests__/web.test.ts` into `web-signin.test.ts` and
  `web-button.test.ts` over a shared harness in `__tests__/helpers/gisHarness.ts`.
- `plugin/build/` is no longer tracked in git. It is generated by `npm run build:plugin`,
  which runs automatically via the `prepare` lifecycle script on install and publish.

### Added

- CI workflow running tests and typecheck on push and pull request.
- `npm run typecheck` script.

## [0.3.0] - 2026-05-15

### Added

- `renderGoogleSignInButton(element, options)` — mounts Google's officially styled
  Sign-In button into a DOM element and returns an `unmount` function. Clicking it
  opens Google's popup, which works in Firefox and Safari and for users with no
  active Google session, where FedCM / One Tap silently no-ops. Delivers the same
  `SignInResult` shape as `signIn()`. Web-only; throws `ERR_UNKNOWN` on iOS and Android.
- `SignInButtonOptions` type covering GIS button styling (`theme`, `size`, `text`,
  `shape`, `logo_alignment`, `width`) plus `onSuccess` / `onError` / `nonce`.

## [0.2.2] - 2026-05-14

### Fixed

- Silenced the `GSI_LOGGER` FedCM deprecation warning. Under FedCM (Chrome 128+),
  reading the legacy `isNotDisplayedMoment` / `isSkippedMoment` predicates logs a
  deprecation notice and always returns `false`; the web module now reads only the
  dismissed-moment channel.

## [0.2.1] - 2026-05-14

### Fixed

- Included `src/web/*.ts` in the published tarball. The 0.2.0 package shipped without
  the web helper modules, so importing the package on web failed to resolve.

## [0.2.0] - 2026-05-14

### Added

- Web platform support via Google Identity Services. `configure`, `signIn`, `signOut`,
  and `getCurrentUser` work on Expo Web with no `Platform.OS` branching — Metro and
  webpack resolve `src/ExpoGoogleSigninModule.web.ts` automatically.
- `configure()` auto-injects the GIS script (`https://accounts.google.com/gsi/client`).
- `signIn()` triggers the One Tap / FedCM prompt and maps GIS prompt moments to
  `GoogleSigninError` codes.
- `getCurrentUser()` restores a cached session from `sessionStorage`, checking the ID
  token's `exp` claim and returning `null` for expired tokens.
- `signOut()` clears `sessionStorage` and calls `disableAutoSelect()`.
- `hostedDomain` enforcement on web via the ID token's `hd` claim. GIS does not
  pre-filter, so a mismatch rejects with `ERR_NO_CREDENTIAL` after sign-in.
- GIS script load failure surfaces as `ERR_NETWORK`.
- `web` registered as a supported platform in `expo-module.config.json`.

## [0.1.4] - 2026-05-10

### Changed

- README wording.

## [0.1.3] - 2026-05-10

### Added

- `repository`, `bugs`, and `homepage` fields in `package.json`.

## 0.1.2 - 2026-05-10

### Changed

- CI: upgraded GitHub Actions to v6 and surfaced the npm debug log on publish failure.

## 0.1.1 - 2026-05-10

### Added

- OIDC-based npm publish workflow, with `android/build.gradle` version kept in sync
  with `package.json` via the `version` lifecycle script.

## 0.1.0 - 2026-05-10

### Added

- Initial release. Native Google Sign-In for Expo with `configure`, `signIn`,
  `signOut`, and `getCurrentUser`.
- Android via Credential Manager and the Google ID helper library.
- iOS via the GoogleSignIn SDK 9.x, with an app delegate subscriber for URL handling.
- Config plugin adding the reversed iOS client ID to `CFBundleURLTypes`.
- `GoogleSigninError` with stable `code` values, hashed `nonce` support for backends
  like Supabase, and `hostedDomain` restriction on native.
- New architecture support.

[Unreleased]: https://github.com/filipfrlic/expo-google-signin/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/filipfrlic/expo-google-signin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/filipfrlic/expo-google-signin/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/filipfrlic/expo-google-signin/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/filipfrlic/expo-google-signin/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/filipfrlic/expo-google-signin/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/filipfrlic/expo-google-signin/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/filipfrlic/expo-google-signin/releases/tag/v0.1.3
