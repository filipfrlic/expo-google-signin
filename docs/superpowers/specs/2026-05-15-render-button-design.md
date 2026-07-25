# Render Sign-In button for @filipfrlic/expo-google-signin

Date: 2026-05-15
Status: Implemented — shipped in 0.3.0

## Goal

Add a `renderGoogleSignInButton(element, options)` export that mounts Google's officially-styled Sign-In button into a DOM element. Clicking the button opens Google's sign-in popup, which works in every modern browser (including Firefox / Safari and any user without an active Google session) where FedCM / One Tap silently fails today. The button delivers the same `SignInResult` shape (`{ idToken, user }`) that `signIn()` returns.

Non-goals: access-token / OAuth-scope flows (still on roadmap), auto-fallback chaining where `signIn()` opens a popup itself, a pre-baked React component wrapper.

## Public API

```ts
import { renderGoogleSignInButton } from '@filipfrlic/expo-google-signin';

useEffect(() => {
  if (!ref.current) return;
  return renderGoogleSignInButton(ref.current, {
    onSuccess: ({ idToken, user }) => { /* ... */ },
    onError: (e) => console.warn(e.code, e.message),
    theme: 'outline',
    size: 'large',
  });
}, []);
```

Return value is an `unmount: () => void` that clears the element's inner content. Drops naturally into a `useEffect` cleanup slot.

### `SignInButtonOptions` (new, in `src/types.ts`)

```ts
export type SignInButtonOptions = {
  /** Required. Fires when the user signs in successfully. */
  onSuccess: (result: SignInResult) => void;
  /** Optional. Fires on decode failure or hostedDomain mismatch. */
  onError?: (error: GoogleSigninError) => void;
  /** Hashed nonce; same semantics as SignInOptions.nonce. */
  nonce?: string;
  /** GIS button styling — passed through to renderButton verbatim. */
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
};
```

## Architecture

Same platform-split pattern as `ExpoGoogleSigninModule.{ts,web.ts}`. Metro/webpack auto-resolves the right variant per platform.

- `src/renderGoogleSignInButton.ts` — native stub. Synchronously throws `GoogleSigninError('ERR_UNKNOWN', 'renderGoogleSignInButton is web-only — use signIn() on native')`. iOS/Android consumers calling it get an immediate, debuggable error.
- `src/renderGoogleSignInButton.web.ts` — real implementation backed by GIS `renderButton`.

### Refactor in `src/ExpoGoogleSigninModule.web.ts`

Extract the credential-callback body (decode JWT, validate `hd`, build user, cache, resolve) into a shared helper. Both `signIn` and `renderGoogleSignInButton` rely on the identical pipeline; duplicating it would be a maintenance hazard.

```ts
// Internal helper, not exported.
const resolveCredential = (
  credential: string,
  config: ConfigureOptions
): { ok: true; result: SignInResult } | { ok: false; error: GoogleSigninError } => {
  try {
    const decoded = decodeIdToken(credential);
    if (config.hostedDomain && decoded.hd !== config.hostedDomain) {
      return {
        ok: false,
        error: new GoogleSigninError(
          'ERR_NO_CREDENTIAL',
          `hostedDomain mismatch: expected ${config.hostedDomain}, got ${decoded.hd ?? 'none'}`
        ),
      };
    }
    const user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name ?? null,
      givenName: decoded.given_name ?? null,
      familyName: decoded.family_name ?? null,
      photo: decoded.picture ?? null,
    };
    const result: SignInResult = { idToken: credential, user };
    writeCached(result);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: new GoogleSigninError('ERR_UNKNOWN', (err as Error).message),
    };
  }
};
```

The web `signIn` is updated to call `resolveCredential` inside the GIS callback rather than inlining the logic. `renderGoogleSignInButton.web.ts` imports `resolveCredential` from the web module and uses it the same way.

## Behavior

### `renderGoogleSignInButton.web.ts`

1. Throw `ERR_NOT_CONFIGURED` if `configure()` was never called.
2. Validate `element` is a real `HTMLElement` (defensive — calling renderButton on `null` is a confusing crash).
3. Build an `unmount` that clears `element.innerHTML` and returns it immediately.
4. Asynchronously: await `loadGis()`. On failure, fire `onError(GoogleSigninError('ERR_NETWORK', ...))`. If the unmount already fired (the consumer cleaned up before GIS loaded), skip everything.
5. After load: call `google.accounts.id.initialize({ client_id, callback, nonce, use_fedcm_for_prompt: true, auto_select: false })` where the `callback` runs `resolveCredential` and dispatches to `onSuccess` / `onError`.
6. Call `google.accounts.id.renderButton(element, { theme, size, text, shape, logo_alignment, width })`. GIS paints the button into `element` and wires up the click → popup flow itself.

### Cancellation handling

GIS does not fire a moment notification for the rendered-button flow when the user closes the popup — that case simply produces no callback. We do **not** call `signOut` / `disableAutoSelect` from this function; that's the consumer's job via the existing `signOut()` export.

### Caching

Successful sign-in writes to the same `sessionStorage` key the One Tap path uses, so `getCurrentUser()` returns the result after a button click just as it does after `signIn()`.

### Native stub

`src/renderGoogleSignInButton.ts` throws synchronously on call. This matches the spirit of `requireNativeModule` — calling something unsupported on a platform should fail loudly, not silently no-op.

## File changes

New:
- `src/renderGoogleSignInButton.ts`
- `src/renderGoogleSignInButton.web.ts`

Modified:
- `src/index.ts` — re-export `renderGoogleSignInButton`, re-export `SignInButtonOptions` type.
- `src/types.ts` — add `SignInButtonOptions`.
- `src/ExpoGoogleSigninModule.web.ts` — extract `resolveCredential`, refactor `signIn` to use it. Export `resolveCredential` (named, not on the default export) for the button module to consume.
- `src/__tests__/web.test.ts` — append `describe('renderGoogleSignInButton')` block (see Testing).
- `README.md` — add a section under Usage explaining the button flow + when to reach for it; mention in Troubleshooting that Firefox / Safari / unauthenticated users need this path.

No native (iOS / Android) code changes.

## Testing

In `src/__tests__/web.test.ts`, mock `google.accounts.id.renderButton` on `installGisGlobal`. New cases under `describe('renderGoogleSignInButton')`:

- Calls `renderButton(element, ...)` with the passed styling options.
- `onSuccess` fires with decoded `SignInResult` when the credential callback runs.
- `onError` fires with `ERR_NO_CREDENTIAL` on `hd` mismatch; result is not cached.
- `onError` fires with `ERR_NETWORK` if `loadGis` rejects.
- Throws `ERR_NOT_CONFIGURED` synchronously when called before `configure()`.
- `nonce` is forwarded to `initialize`.
- The returned unmount clears `element.innerHTML`.
- Result is also written to `sessionStorage` cache (so `getCurrentUser()` works after a button click).

Native stub: not tested directly — the platform-split mechanism (`.web.ts` resolution) is already exercised by the existing module; a no-DOM test of "throws synchronously" would just re-test that throwing works.

## Versioning

`0.3.0` — minor bump. New public export, additive only, no breaking changes.
