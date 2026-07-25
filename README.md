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
- `getCurrentUser()` restores the cached session: native SDKs persist across app launches, web reads from `sessionStorage` (does not survive a tab close). On every platform the ID token's `exp` claim is checked; expired tokens resolve to `null`.
- `signOut()` clears the SDK's cached account on native, and clears `sessionStorage` plus calls `disableAutoSelect()` on web.

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

Calling this on iOS or Android throws `GoogleSigninError('ERR_UNKNOWN', ...)`; it's web-only. Use `signIn()` on native.

Most production web apps render this button as the primary sign-in UI and treat One Tap as a silent fast-path optimization.

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

- Additional OAuth scopes + `accessToken` for Drive/Calendar/etc.
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
