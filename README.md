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
} catch (e) {
  if (e instanceof GoogleSigninError && e.code === 'ERR_SIGN_IN_CANCELLED') return;
  // ...
}
```

## Roadmap

- v0.2 — additional OAuth scopes + `accessToken` (Drive, Calendar, etc.)
- v0.3 — server auth code (offline access)
- v0.4 — web support via Google Identity Services

## License

MIT © Filip Frlic
