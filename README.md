# @filipfrlic/expo-google-signin

A Google Sign-In package for Expo. Uses Credential Manager on Android, Google's iOS SDK (9.x) on iOS, and Google Identity Services (One Tap / FedCM) on web. Works with the new architecture.

## Install

```bash
npx expo install @filipfrlic/expo-google-signin
```

## Configure

Add the plugin to `app.json`:

```json
{
  "plugins": [
    ["@filipfrlic/expo-google-signin", {
      "iosUrlScheme": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID_REVERSED"
    }]
  ]
}
```

Call `configure` once, before any sign-in:

```ts
import { configure } from '@filipfrlic/expo-google-signin';

configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com', // optional if you bundle GoogleService-Info.plist
});
```

### Client IDs

From the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

- **Web OAuth client ID** → `webClientId`. Both iOS and Android use this to mint the ID token. Use the *web* client ID even on mobile — backends like Supabase or Firebase verify against this one.
- **iOS OAuth client ID** → `iosClientId`. Reverse it (`com.googleusercontent.apps.<id>`) and pass that as the plugin's `iosUrlScheme`. Optional if `GoogleService-Info.plist` is bundled.
- **Android OAuth client ID** is not passed to the package, but it must exist in the Cloud Console with your app's package name and the signing-key SHA-1. Without it, Credential Manager returns no credential and gives you no error to debug.

Grab the SHA-1:

```bash
# debug builds
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android

# EAS release builds: eas credentials → "View signing credentials"
```

Register every fingerprint that might sign your app: debug, EAS internal, EAS production.

### Web

No plugin step or `iosUrlScheme` is needed. Just call `configure({ webClientId })`. The package auto-injects the Google Identity Services script (`https://accounts.google.com/gsi/client`) on `configure()`, and `signIn()` triggers the One Tap / FedCM prompt.

Make sure your **Web OAuth client** in the Google Cloud Console has the page origin (e.g. `http://localhost:8081`, `https://your-app.com`) registered under *Authorized JavaScript origins*. Without it, the prompt is suppressed and you'll see `ERR_UNKNOWN` with `unregistered_origin` in the message.

`ERR_PLAY_SERVICES_UNAVAILABLE` is never emitted on web. All other error codes apply the same way they do on native.

## Usage

```ts
import { signIn, signOut, getCurrentUser, GoogleSigninError } from '@filipfrlic/expo-google-signin';

const { idToken, user } = await signIn();

const restored = await getCurrentUser(); // null if no cached session
await signOut();
```

> [!IMPORTANT]
> `idToken` is the only signed artifact in that result. `user` is decoded from
> its payload **without verifying the signature**, which no client can do on its
> own — it is what you render, never what you authorize on. Send `idToken` to
> your backend, verify it against Google's public keys (check `aud` and, if you
> use it, `hd`), and read identity from the verified claims. See
> [Verifying on your backend](#verifying-on-your-backend).

### With Supabase

```ts
import { sha256 } from 'js-sha256';

const rawNonce = generateRandomString();
const hashed = sha256(rawNonce);

const { idToken } = await signIn({ nonce: hashed });

await supabase.auth.signInWithIdToken({
  provider: 'google',
  token: idToken,
  nonce: rawNonce,
});
```

### Platform behavior

The same code path works on iOS, Android, and web. Differences worth knowing:

- `signIn()` surfaces the platform's account chooser — Google's iOS sheet, Android's Credential Manager bottom sheet, or the web FedCM / One Tap prompt.
- `getCurrentUser()` restores the cached session: native SDKs persist across app launches, web reads from `sessionStorage` (does not survive a tab close). On every platform the ID token's `exp` claim is checked, the `hd` claim is re-checked against a configured `hostedDomain`, and the returned `user` is re-derived from the token itself — a session that fails any of those resolves to `null` and is dropped from the cache.
- `signOut()` clears the SDK's cached account on native, and clears `sessionStorage` plus calls `disableAutoSelect()` on web. It does **not** revoke: an access token from `authorize()` stays valid at Google until it expires (~1h). To kill one immediately, call Google's `/revoke` endpoint from your backend.

### Web: rendered Sign-In button

`signIn()` on web uses FedCM / One Tap, which is Chrome-only and silently no-ops when the user isn't already signed into Google. For Firefox, Safari, or a fresh-browser fallback, render the Google-styled button — clicking it opens Google's popup (with login if needed) and produces the same `SignInResult`.

```ts
import { renderGoogleSignInButton } from '@filipfrlic/expo-google-signin';

useEffect(() => {
  if (!ref.current) return;
  return renderGoogleSignInButton(ref.current, {
    onSuccess: ({ idToken, user }) => { /* hand idToken to your backend */ },
    onError: (e) => console.warn(e.code, e.message),
    theme: 'outline',
    size: 'large',
  });
}, []);
```

The return value is an `unmount` function that clears the element — drops straight into `useEffect`'s cleanup slot.

Google Identity Services allows one active consumer per page, so a rendered button and an in-flight `signIn()` cannot coexist. Whichever starts last takes over; the other gets an `ERR_UNKNOWN` through `onError` (or a rejected promise) rather than hanging forever on a credential that will be delivered elsewhere. Pick one per screen.

Calling this on iOS or Android throws `GoogleSigninError('ERR_UNKNOWN', ...)`; it's web-only. Use `signIn()` on native.

Most production web apps render this button as the primary sign-in UI and treat One Tap as a silent fast-path optimization.

## Scopes and access tokens

`signIn()` gives you an ID token, which proves *who* the user is. To call Google APIs on their behalf — Drive, Calendar, Gmail — you need an **access token** with explicit scopes. That's `authorize()`:

```ts
import { authorize } from '@filipfrlic/expo-google-signin';

const { accessToken, grantedScopes, expiresAt } = await authorize({
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

await fetch('https://www.googleapis.com/drive/v3/files', {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

Scopes are full URLs, exactly as they appear in [Google's OAuth scope list](https://developers.google.com/identity/protocols/oauth2/scopes).

Three things to get right:

- **Call `signIn()` first.** `authorize()` grants scopes for a signed-in user. On iOS it throws `ERR_NO_CREDENTIAL` without one.
- **On web, call it from a click handler.** It opens a popup, and browsers block popups that don't originate from a user gesture. A blocked popup surfaces as `ERR_NETWORK`. Don't call it on page load or in a `useEffect`.
- **Check `grantedScopes`.** Google supports granular consent — users can approve some scopes and refuse others — so a resolved promise does not mean you got everything you asked for.

```ts
const { grantedScopes } = await authorize({ scopes: [DRIVE, CALENDAR] });

if (!grantedScopes.includes(CALENDAR)) {
  // user approved Drive only — degrade gracefully
}
```

### Token expiry

`expiresAt` is epoch milliseconds, or `null` when the platform doesn't report one. **Android is always `null`** — its `AuthorizationResult` exposes no expiry — so treat `null` as "unknown" and re-authorize when an API call returns 401.

The package holds no token state. When a token expires, call `authorize()` again: it's silent on iOS and Android once consent exists, and a fast popup on web.

```ts
if (expiresAt === null || Date.now() >= expiresAt) {
  ({ accessToken } = await authorize({ scopes: [DRIVE] }));
}
```

### Platform notes

Access tokens come from a different API than ID tokens on two of the three platforms, which is why this is a separate call rather than an option on `signIn()`:

| | Source | Extra consent UI |
|---|---|---|
| iOS | `addScopes` on the GoogleSignIn SDK | Only for new scopes |
| Android | `AuthorizationClient` (Credential Manager issues ID tokens only) | Only for new scopes |
| Web | `google.accounts.oauth2` token client | Popup, every time |

**Web has no refresh token.** The browser flow is the OAuth implicit grant, which returns an access token and nothing else. Every renewal is another popup needing another user gesture. If your web app needs unattended Google API access, do it from your backend with a server auth code rather than from the browser.

**Consent is pinned to the signed-in account — on native.** On a device with several Google accounts, `authorize()` must not let the consent screen drift to an account other than the one `signIn()` returned, because the result carries no account and the caller could never tell. iOS operates on the current user. Android pins the request to that account, and Android additionally cross-checks the account that actually granted against the pinned one, rejecting with `ERR_NO_CREDENTIAL` on a mismatch. A configured `hostedDomain` is applied to the authorization request too.

Android's pin is held in memory, so a process restart clears it. Rather than authorizing unpinned, `authorize()` silently recovers the account from Credential Manager (no UI — only previously-authorized accounts), and rejects with `ERR_NO_CREDENTIAL` if it cannot. Calling `signIn()` or `getCurrentUser()` first, which most apps do anyway, makes that path moot.

> [!WARNING]
> **Web cannot make this guarantee.** GIS `login_hint` is a hint: the user can still switch accounts inside the popup, and the token response carries no account, so the browser has no way to report which one granted. If your app cares — anything that writes to a user's Drive, reads their Gmail, or attributes data to an identity — confirm it server-side: call Google's `tokeninfo`/`userinfo` endpoint with the access token and compare its `sub` to the verified ID token's `sub`.

## Verifying on your backend

Everything this package hands you is client-side, so treat it that way. The `user` object, the `hd` domain gate, and the `exp` check are conveniences for rendering and for keeping obviously-unusable sessions out of your UI — a client can decode a JWT but cannot verify one, and anything running on the user's device or browser can be changed by whoever holds it.

The single thing worth trusting is `idToken`, and only after your backend verifies it:

1. Verify the signature against [Google's public keys](https://www.googleapis.com/oauth2/v3/certs) (use a library — `google-auth-library`, `google-auth`, or your provider's built-in verifier).
2. Check `aud` is your web client ID and `iss` is `accounts.google.com` or `https://accounts.google.com`.
3. Check `exp` has not passed.
4. If you use `hostedDomain`, check the `hd` claim there too — the client-side check filters the UI, it does not enforce anything.
5. Read the user's identity from the **verified claims** (`sub`, `email`), not from whatever the client sent alongside the token.

If you hand `idToken` to Supabase, Firebase, or Auth0, they do all of this for you — that is what makes those integrations safe. Only roll it yourself if you own the backend.

## Errors

Errors thrown by this package are `GoogleSigninError` with a typed `code`:

| Code | Cause |
|---|---|
| `ERR_SIGN_IN_CANCELLED` | User dismissed the sheet |
| `ERR_NO_CREDENTIAL` | No Google account on the device |
| `ERR_PLAY_SERVICES_UNAVAILABLE` | Android: Play Services missing or outdated |
| `ERR_NETWORK` | Network failure |
| `ERR_NOT_CONFIGURED` | `configure()` was not called |
| `ERR_UNKNOWN` | Anything else |

Branch on `code`, not `instanceof` — `instanceof` can fail across module realms (Metro bundles, hot reload, etc.):

```ts
try {
  await signIn();
} catch (e: any) {
  if (e?.code === 'ERR_SIGN_IN_CANCELLED') return;
  // ...
}
```

## Troubleshooting

### Web: the prompt never shows up

Under FedCM (Chrome 128+), GIS handles most of this in browser-native UI rather than firing a specific error code. Common causes:

- **Origin not registered.** Add every page origin you sign in from (e.g. `http://localhost:8081`, `https://your-app.com`) to *Authorized JavaScript origins* on your Web OAuth client. GIS will log an error in the console; the prompt won't appear.
- **User isn't signed in to any Google account in the browser.** FedCM does not show a Google login UI from third-party sites; if no session exists, the prompt silently fails. Use [`renderGoogleSignInButton`](#web-rendered-sign-in-button) — clicking the rendered button opens Google's popup with login.
- **Browser doesn't support FedCM.** Firefox and Safari don't ship FedCM, and the pre-FedCM One Tap fallback needs third-party cookies they block by default. Use `renderGoogleSignInButton` instead.
- **Throttling.** GIS rate-limits repeat prompts after a user dismisses them. Reload the page or wait.
- **CSP blocking the script.** If your `script-src` is locked down, add `https://accounts.google.com` to it. A blocked script surfaces as `ERR_NETWORK`.

### Android: sign-in returns `ERR_NO_CREDENTIAL` on every attempt

Credential Manager could not find a matching Google account for your app. Usually the signing key's SHA-1 isn't registered against your Android OAuth client. Re-check with `keytool` (see [Client IDs](#client-ids)) and add a fingerprint for every key that may sign builds — debug, EAS internal, EAS production. The Android API gives no error code for this; it just returns no credential.

### iOS: the Google sheet opens then immediately closes

`iosUrlScheme` is missing or wrong. Confirm the plugin block in `app.json` uses the *reversed* iOS client ID (`com.googleusercontent.apps.<NUMBER>-<HASH>`), then rebuild the dev client — config plugin changes only take effect after `expo prebuild` / a native rebuild.

### `instanceof GoogleSigninError` is false even though the error came from this package

Some bundlers create multiple module realms (Metro hot reload, certain test runners). Branch on `error.code` instead — see [Errors](#errors).

## Roadmap

- Server auth code for offline access

## Development

```bash
npm install       # also compiles the config plugin via `prepare`
npm test          # jest
npm run typecheck # tsc --noEmit
```

Native Android and iOS code has no automated coverage — CI runs the TypeScript suite
only, so changes under `android/src` or `ios/` need a manual build against a real app.

Released versions are listed in [CHANGELOG.md](CHANGELOG.md).

## License

MIT © Filip Frlic
