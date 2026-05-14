# Web support for @filipfrlic/expo-google-signin

Date: 2026-05-14
Status: Approved

## Goal

Add web platform support to the package by wiring up Google Identity Services (GIS). The public TypeScript API (`configure`, `signIn`, `signOut`, `getCurrentUser`, `GoogleSigninError`) stays identical to native — Expo Web apps that already use this package on iOS/Android can call the same code with no `Platform.OS` branching.

Non-goals: access tokens / OAuth scopes (Drive, Calendar, etc.), rendered button UI, server auth code. These remain in the README roadmap.

## Architecture

### Platform shim

`src/index.ts` is unchanged. It imports from `./ExpoGoogleSigninModule`. Metro/webpack auto-resolves the platform-specific file:

- `src/ExpoGoogleSigninModule.ts` — existing, calls `requireNativeModule('ExpoGoogleSignin')` for iOS/Android.
- `src/ExpoGoogleSigninModule.web.ts` — new, pure-JS implementation backed by GIS.

Both files export the same module shape:

```ts
{
  configure(options: ConfigureOptions): void;
  signIn(options: SignInOptions): Promise<SignInResult>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<SignInResult | null>;
}
```

### Internal units

The web module is split into small focused files:

- `src/web/loadGis.ts` — injects `<script src="https://accounts.google.com/gsi/client" async defer>` into `document.head` once. Exports `loadGis(): Promise<void>` that resolves on `script.onload`. Idempotent: subsequent calls return the same promise. Rejects with `ERR_NETWORK` on `script.onerror`.
- `src/web/storage.ts` — `readCached(): SignInResult | null`, `writeCached(result: SignInResult): void`, `clearCached(): void`. Backed by `sessionStorage` under a single namespaced key (e.g. `expo-google-signin:session`). `readCached()` decodes the JWT `exp` claim and returns `null` if the token has expired, also clearing the entry.
- `src/web/decodeIdToken.ts` — `decodeIdToken(jwt: string): { sub, email, name?, given_name?, family_name?, picture?, hd?, exp }`. Base64url-decodes the payload segment. Throws on malformed JWTs (caller maps to `ERR_UNKNOWN`).
- `src/ExpoGoogleSigninModule.web.ts` — orchestrator. Holds the `configure()` options in a module-level variable, delegates to the units above.

### expo-module.config.json

Add `"web"` to the `platforms` array:

```json
{
  "platforms": ["ios", "android", "web"],
  ...
}
```

No `web` sub-object is needed — there is no native web module to register. The TypeScript shim is the wiring.

### Config plugin

The existing `plugin/src/withGoogleSignin.ts` is iOS-only (`withInfoPlist`). It does not change. Web requires no plugin configuration — `configure()` at runtime is sufficient.

## Behavior

### configure(options)

1. Validate `webClientId` is present (existing JS guard already handles this in `index.ts`).
2. Store `options` in a module-level variable for later `signIn` calls.
3. Call `loadGis()` and store the returned promise. Do not await — `signIn` awaits it. This lets `configure` stay synchronous to match the native contract.

`iosClientId` is silently ignored on web. `hostedDomain` is enforced post-flight (see signIn).

### signIn(options)

1. If `configure()` was not called → reject with `ERR_NOT_CONFIGURED`.
2. Await the GIS script load promise. If it rejected → propagate as `ERR_NETWORK`.
3. Call `google.accounts.id.initialize({ client_id: webClientId, callback, nonce: options.nonce, use_fedcm_for_prompt: true, auto_select: false })`. Re-initialize on every call so `nonce` is fresh.
4. Call `google.accounts.id.prompt(notification => ...)`.
5. Single-shot resolution: both the credential callback (registered in `initialize`) and the moment notification callback feed a guarded resolver that fires at most once.
   - **Credential callback fires** with `{ credential }` → `decodeIdToken(credential)`, build `SignInResult`, validate `hostedDomain` against `hd` claim if configured, `writeCached(result)`, resolve. After this, the moment notification's later `isDismissedMoment()` / `getDismissedReason() === 'credential_returned'` is ignored.
   - **Moment notification fires** indicating not displayed / skipped / dismissed (with any reason other than `credential_returned`) before any credential → reject with the mapped error from the table below.

`use_fedcm_for_prompt: true` is required for Chrome 128+ where third-party cookies are gone.

### signOut()

1. If GIS is loaded, call `google.accounts.id.disableAutoSelect()` (suppresses One Tap auto-select on next `prompt()`).
2. `clearCached()`.
3. Resolve.

Does not reject — matches native behavior, which treats sign-out as best-effort cleanup.

### getCurrentUser()

1. Call `readCached()`. Returns the cached `SignInResult` or `null`. Expired tokens are cleared and return `null`.

Does not call GIS or trigger a prompt. Pure local read.

### hostedDomain enforcement

GIS does not pre-filter by hosted domain. After receiving a credential, if `configure({ hostedDomain })` was set:

- Decode the ID token, read the `hd` claim.
- If `hd !== hostedDomain` → reject with `ERR_NO_CREDENTIAL` and do **not** cache.

This matches the spirit of the option on native (where the SDK enforces it).

## Error mapping

Web maps GIS outcomes to the existing `ErrorCode` union. No new codes are introduced.

| GIS situation | Code |
|---|---|
| `notification.isSkippedMoment()` with reason `user_cancel` or `tap_outside` | `ERR_SIGN_IN_CANCELLED` |
| `notification.isDismissedMoment()` with reason `cancel_called` | `ERR_SIGN_IN_CANCELLED` |
| `notification.isNotDisplayed()` with reason `opt_out_or_no_session` or `suppressed_by_user` | `ERR_NO_CREDENTIAL` |
| `hostedDomain` mismatch on returned token | `ERR_NO_CREDENTIAL` |
| Script tag `onerror` | `ERR_NETWORK` |
| `signIn` / `getCurrentUser` called before `configure` | `ERR_NOT_CONFIGURED` |
| Everything else (`invalid_client`, `unregistered_origin`, `unknown_reason`, malformed JWT, etc.) | `ERR_UNKNOWN` — the GIS reason string goes into `.message` |

`ERR_PLAY_SERVICES_UNAVAILABLE` is Android-only and is never emitted on web. The union already includes it; no change.

`mapNativeError` in `src/errors.ts` is unchanged — the web module constructs `GoogleSigninError` instances directly.

## Testing

Mirror the existing `src/__tests__/` Jest setup (`jest-expo` preset).

- `src/__tests__/web.test.ts` — mocks `window.google.accounts.id` and `document.head.appendChild`. Cases:
  - `configure()` without `webClientId` throws `ERR_NOT_CONFIGURED` (already covered by `index.test.ts`; web-specific assertion: script tag is appended on `configure`).
  - `signIn()` resolves with the decoded user on credential callback.
  - `signIn()` rejects with `ERR_SIGN_IN_CANCELLED` when prompt notification is `skipped:user_cancel`.
  - `signIn()` rejects with `ERR_NO_CREDENTIAL` when prompt is `notDisplayed:opt_out_or_no_session`.
  - `signIn()` rejects with `ERR_NO_CREDENTIAL` when returned token's `hd` does not match configured `hostedDomain`.
  - `signIn()` passes `nonce` through to `google.accounts.id.initialize`.
  - `getCurrentUser()` returns the cached result after a successful `signIn()`.
  - `getCurrentUser()` returns `null` when no session is cached.
  - `getCurrentUser()` returns `null` and clears storage when the cached token's `exp` is in the past.
  - `signOut()` clears cache and calls `disableAutoSelect`.
- `src/__tests__/decodeIdToken.test.ts` — JWT decoding: well-formed, malformed (throws), missing optional claims (returns nulls).

Tests run via existing `npm test`. The web tests need `jsdom` for `document` / `window`; the existing `jest-expo` preset defaults to `node`. Use per-file docblock pragmas (`/** @jest-environment jsdom */`) on `web.test.ts` and `decodeIdToken.test.ts` so `jest.config.js` stays untouched and the existing native-mock tests keep their `node` environment.

## Documentation

`README.md` changes:

- Lead sentence: drop "No web support yet."
- Under **Configure**, add a brief **Web** subsection: no plugin step, just `configure()`. Note that web emits the same `GoogleSigninError` codes (minus `ERR_PLAY_SERVICES_UNAVAILABLE`).
- Roadmap: remove the "Web via Google Identity Services" line.

## Files touched

New:
- `src/ExpoGoogleSigninModule.web.ts`
- `src/web/loadGis.ts`
- `src/web/storage.ts`
- `src/web/decodeIdToken.ts`
- `src/__tests__/web.test.ts`
- `src/__tests__/decodeIdToken.test.ts`

Modified:
- `expo-module.config.json` — add `"web"` to `platforms`.
- `README.md` — lead sentence, Configure section, Roadmap.

Unchanged:
- `src/index.ts`, `src/types.ts`, `src/errors.ts`, `src/ExpoGoogleSigninModule.ts` (native).
- `plugin/src/withGoogleSignin.ts`.
- Native iOS / Android code.
