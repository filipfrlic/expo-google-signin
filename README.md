# expo-google-signin

Native Google Sign-In for Expo. Free, focused, new-architecture-ready.

- **Android:** Credential Manager (`androidx.credentials`) — the modern AndroidX API Google now recommends.
- **iOS:** GoogleSignIn 9.x SDK — the official Google iOS framework.
- **Web:** not yet (planned for v2).

No paid tier, no kitchen-sink scope creep, no deprecated APIs.

## Install

```bash
npx expo install expo-google-signin
```

## Configure

In `app.json` plugins:

```json
{
  "plugins": [
    ["expo-google-signin", {
      "iosUrlScheme": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID_REVERSED"
    }]
  ]
}
```

In your app entry (e.g. `app/_layout.tsx`):

```ts
import { configure } from 'expo-google-signin';

configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com', // optional, falls back to GoogleService-Info.plist
});
```

### Getting your client IDs

You'll need three values from the Google Cloud Console (`https://console.cloud.google.com/apis/credentials`):

- **Web OAuth 2.0 client ID** → `webClientId`. The mint of cross-platform ID tokens. Required by both iOS and Android. Common newcomer mistake: passing the iOS client ID here — backend verification (Firebase, Supabase, custom) requires the **web** client ID.
- **iOS OAuth 2.0 client ID** → `iosClientId`. Set in the Google Cloud Console under "iOS" credentials with your app's bundle identifier. The reversed form (`com.googleusercontent.apps.<NUMBER>-<HASH>`) becomes the `iosUrlScheme` plugin prop. If you bundle a `GoogleService-Info.plist`, this is read automatically and `iosClientId` becomes optional.
- **Android OAuth 2.0 client ID** → not passed to the package, but **must exist in the Cloud Console** with your app's package name and the **SHA-1 fingerprint of the signing key**. Without this registration, Credential Manager will silently return no credential. Get the SHA-1 with:

  ```bash
  # debug builds (development)
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android

  # release builds (EAS / production)
  # use eas credentials → "View signing credentials" or your own keystore
  ```

  Register every fingerprint your app might be signed with (debug, EAS internal, EAS production).

The package itself does not read `google-services.json` — Android only needs the OAuth client + SHA-1 registration on the Cloud side.

## API

```ts
import { signIn, signOut, getCurrentUser, GoogleSigninError } from 'expo-google-signin';

// Show the system Google sign-in sheet.
const { idToken, user } = await signIn();

// Silent restore — returns null if no authorized account is cached.
const restored = await getCurrentUser();

// Clear OS-level credential state.
await signOut();
```

### Supabase / nonce verification

```ts
import { sha256 } from 'js-sha256';

const rawNonce = generateRandomString();
const hashed = sha256(rawNonce);

const { idToken } = await signIn({ nonce: hashed });

await supabase.auth.signInWithIdToken({
  provider: 'google',
  token: idToken,
  nonce: rawNonce, // Supabase verifies hashed(rawNonce) === idToken.nonce
});
```

## Errors

All thrown errors are `GoogleSigninError` instances with a typed `code`:

| Code | When |
|---|---|
| `ERR_SIGN_IN_CANCELLED` | User dismissed the sheet |
| `ERR_NO_CREDENTIAL` | `signIn` on a device with no Google account |
| `ERR_PLAY_SERVICES_UNAVAILABLE` | Android only — Play Services missing/outdated |
| `ERR_NETWORK` | Network failure |
| `ERR_NOT_CONFIGURED` | `configure()` was not called |
| `ERR_UNKNOWN` | Anything else |

```ts
try {
  await signIn();
} catch (e: any) {
  // Use the typed `code` rather than `instanceof` — `code` survives every bundle/realm boundary.
  if (e?.code === 'ERR_SIGN_IN_CANCELLED') return;
  // ...
}
```

## Roadmap

Possible future work, unordered:

- Additional OAuth scopes + `accessToken` (Drive, Calendar, etc.)
- Server auth code (offline access)
- Web support via Google Identity Services

## License

MIT © Filip Frlic
