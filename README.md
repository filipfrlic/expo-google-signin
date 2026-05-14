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

## Roadmap

- Additional OAuth scopes + `accessToken` for Drive/Calendar/etc.
- Server auth code for offline access

## License

MIT © Filip Frlic
