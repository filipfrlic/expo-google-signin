# Web Support Implementation Plan

**Status: Completed** — shipped in 0.2.0 (2026-05-14), with follow-up fixes in 0.2.1
and 0.2.2. Kept as a historical record of how web support was built; it is not a
description of current behavior. For that, see the README and `src/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add web platform support to `@filipfrlic/expo-google-signin` by wiring up Google Identity Services (GIS) behind the existing TypeScript API so Expo Web apps can call `configure / signIn / signOut / getCurrentUser` with no platform branching.

**Architecture:** Metro/webpack auto-resolves `src/ExpoGoogleSigninModule.web.ts` on web, which orchestrates three small JS units: `loadGis` (script injection), `storage` (sessionStorage cache with JWT-exp check), and `decodeIdToken` (base64url JWT payload decode). Native iOS/Android code and the public `src/index.ts` are untouched.

**Tech Stack:** TypeScript, Google Identity Services (`https://accounts.google.com/gsi/client`, `google.accounts.id` namespace, FedCM-enabled prompt), Jest with `jest-expo` preset, `jsdom` env via per-file docblock pragma.

**Spec:** `docs/superpowers/specs/2026-05-14-web-support-design.md`

---

## Task 1: JWT decoder utility

Build the pure-JS `decodeIdToken` helper. No DOM, no GIS — easy to TDD in isolation. Other tasks depend on this.

**Files:**
- Create: `src/web/decodeIdToken.ts`
- Test: `src/__tests__/decodeIdToken.test.ts`

- [x] **Step 1: Write the failing tests**

Create `src/__tests__/decodeIdToken.test.ts`:

```ts
import { decodeIdToken } from '../web/decodeIdToken';

const b64url = (s: string) =>
  Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const makeJwt = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.signature`;

describe('decodeIdToken', () => {
  it('decodes a well-formed JWT payload', () => {
    const token = makeJwt({
      sub: '1234567890',
      email: 'jane@example.com',
      name: 'Jane Doe',
      given_name: 'Jane',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      hd: 'example.com',
      exp: 1893456000,
    });
    expect(decodeIdToken(token)).toEqual({
      sub: '1234567890',
      email: 'jane@example.com',
      name: 'Jane Doe',
      given_name: 'Jane',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      hd: 'example.com',
      exp: 1893456000,
    });
  });

  it('returns undefined for missing optional claims', () => {
    const token = makeJwt({ sub: 'abc', email: 'a@b.com', exp: 1893456000 });
    const decoded = decodeIdToken(token);
    expect(decoded.sub).toBe('abc');
    expect(decoded.email).toBe('a@b.com');
    expect(decoded.name).toBeUndefined();
    expect(decoded.given_name).toBeUndefined();
    expect(decoded.family_name).toBeUndefined();
    expect(decoded.picture).toBeUndefined();
    expect(decoded.hd).toBeUndefined();
  });

  it('throws on malformed JWT (wrong segment count)', () => {
    expect(() => decodeIdToken('not.a.jwt.token')).toThrow();
    expect(() => decodeIdToken('only-one-segment')).toThrow();
  });

  it('throws on malformed base64', () => {
    expect(() => decodeIdToken('header.!!!notbase64!!!.sig')).toThrow();
  });

  it('handles base64url padding correctly', () => {
    const token = makeJwt({ sub: 'x', email: 'y@z.com', exp: 1 });
    expect(decodeIdToken(token).sub).toBe('x');
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=decodeIdToken`
Expected: FAIL with "Cannot find module '../web/decodeIdToken'"

- [x] **Step 3: Implement decodeIdToken**

Create `src/web/decodeIdToken.ts`:

```ts
export type DecodedIdToken = {
  sub: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  hd?: string;
  exp: number;
};

const base64urlDecode = (input: string): string => {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') {
    return decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }
  // Node fallback (used in tests under jsdom — atob is present, but keep for safety)
  return Buffer.from(b64, 'base64').toString('utf-8');
};

export const decodeIdToken = (jwt: string): DecodedIdToken => {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT: expected 3 segments');
  }
  const json = base64urlDecode(parts[1]);
  const payload = JSON.parse(json) as DecodedIdToken;
  return payload;
};
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=decodeIdToken`
Expected: PASS (5 tests)

- [x] **Step 5: Commit**

```bash
git add src/web/decodeIdToken.ts src/__tests__/decodeIdToken.test.ts
git commit -m "feat(expo-google-signin): add JWT decoder for web ID tokens"
```

---

## Task 2: Register the web platform

Tell `expo-module.config.json` that web is a supported platform. Tiny config change with no test coverage.

**Files:**
- Modify: `expo-module.config.json`

- [x] **Step 1: Update the platforms array**

Edit `expo-module.config.json` — change the `platforms` array from `["ios", "android"]` to `["ios", "android", "web"]`. Result:

```json
{
  "platforms": ["ios", "android", "web"],
  "ios": {
    "modules": ["ExpoGoogleSigninModule"],
    "appDelegateSubscribers": ["ExpoGoogleSigninAppDelegate"],
    "podspecPath": "ios/ExpoGoogleSignin.podspec"
  },
  "android": {
    "modules": ["expo.modules.googlesignin.ExpoGoogleSigninModule"]
  }
}
```

No `web` sub-object is needed — there is no native web module to register. The `.web.ts` file is the wiring.

- [x] **Step 2: Commit**

```bash
git add expo-module.config.json
git commit -m "feat(expo-google-signin): register web as a supported platform"
```

---

## Task 3: Web module skeleton with configure + script injection

Stand up `ExpoGoogleSigninModule.web.ts` with `configure` working end-to-end, including auto-injection of the GIS script. This task establishes the test harness used by all later web tests.

**Files:**
- Create: `src/web/loadGis.ts`
- Create: `src/web/storage.ts`
- Create: `src/ExpoGoogleSigninModule.web.ts`
- Test: `src/__tests__/web.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/__tests__/web.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';

const initializeFn = jest.fn();
const promptFn = jest.fn();
const disableAutoSelectFn = jest.fn();

let appendSpy: jest.SpyInstance;
let injectedScript: HTMLScriptElement | undefined;

function installGisGlobal() {
  (window as unknown as { google: unknown }).google = {
    accounts: {
      id: {
        initialize: initializeFn,
        prompt: promptFn,
        disableAutoSelect: disableAutoSelectFn,
      },
    },
  };
}

beforeEach(() => {
  jest.resetModules();
  initializeFn.mockReset();
  promptFn.mockReset();
  disableAutoSelectFn.mockReset();
  sessionStorage.clear();
  delete (window as unknown as { google?: unknown }).google;
  injectedScript = undefined;
  appendSpy = jest
    .spyOn(document.head, 'appendChild')
    .mockImplementation((node) => {
      if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
        injectedScript = node;
        queueMicrotask(() => {
          installGisGlobal();
          node.onload?.(new Event('load'));
        });
      }
      return node;
    });
});

afterEach(() => {
  appendSpy.mockRestore();
});

function loadModule() {
  return require('../ExpoGoogleSigninModule.web').default as {
    configure: (opts: { webClientId: string; iosClientId?: string; hostedDomain?: string }) => void;
    signIn: (opts: { nonce?: string }) => Promise<{ idToken: string; user: unknown }>;
    signOut: () => Promise<void>;
    getCurrentUser: () => Promise<{ idToken: string; user: unknown } | null>;
  };
}

describe('configure', () => {
  it('injects the GIS script tag on first call', () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    expect(appendSpy).toHaveBeenCalled();
    expect(injectedScript?.src).toBe(GIS_URL);
    expect(injectedScript?.async).toBe(true);
    expect(injectedScript?.defer).toBe(true);
  });

  it('does not inject a second script on repeated calls', () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL with "Cannot find module '../ExpoGoogleSigninModule.web'"

- [x] **Step 3: Implement the script loader**

Create `src/web/loadGis.ts`:

```ts
const GIS_URL = 'https://accounts.google.com/gsi/client';

let loadPromise: Promise<void> | undefined;

export const loadGis = (): Promise<void> => {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = undefined;
      reject(new Error('Failed to load Google Identity Services script'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
};
```

Tests don't need a manual reset — `jest.resetModules()` in `beforeEach` already drops this module from the cache, so the next `require` gets a fresh `loadPromise`.

- [x] **Step 4: Implement the storage layer**

Create `src/web/storage.ts`:

```ts
import type { SignInResult } from '../types';
import { decodeIdToken } from './decodeIdToken';

const KEY = 'expo-google-signin:session';

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export const readCached = (): SignInResult | null => {
  if (!isBrowser()) return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  let parsed: SignInResult;
  try {
    parsed = JSON.parse(raw) as SignInResult;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
  try {
    const { exp } = decodeIdToken(parsed.idToken);
    if (typeof exp === 'number' && exp * 1000 <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
  return parsed;
};

export const writeCached = (result: SignInResult): void => {
  if (!isBrowser()) return;
  sessionStorage.setItem(KEY, JSON.stringify(result));
};

export const clearCached = (): void => {
  if (!isBrowser()) return;
  sessionStorage.removeItem(KEY);
};
```

- [x] **Step 5: Implement the orchestrator skeleton**

Create `src/ExpoGoogleSigninModule.web.ts`:

```ts
import type { ConfigureOptions, SignInOptions, SignInResult } from './types';
import { loadGis } from './web/loadGis';

type Google = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
        nonce?: string;
        use_fedcm_for_prompt?: boolean;
        auto_select?: boolean;
      }) => void;
      prompt: (
        listener?: (notification: {
          isNotDisplayed: () => boolean;
          isSkippedMoment: () => boolean;
          isDismissedMoment: () => boolean;
          getNotDisplayedReason?: () => string;
          getSkippedReason?: () => string;
          getDismissedReason?: () => string;
        }) => void
      ) => void;
      disableAutoSelect: () => void;
    };
  };
};

declare global {
  interface Window {
    google?: Google;
  }
}

let configured: ConfigureOptions | undefined;
let scriptLoad: Promise<void> | undefined;

const configure = (options: ConfigureOptions): void => {
  configured = options;
  if (!scriptLoad) {
    scriptLoad = loadGis();
  }
};

const signIn = async (_options: SignInOptions): Promise<SignInResult> => {
  throw new Error('not implemented');
};

const signOut = async (): Promise<void> => {
  throw new Error('not implemented');
};

const getCurrentUser = async (): Promise<SignInResult | null> => {
  throw new Error('not implemented');
};

export default { configure, signIn, signOut, getCurrentUser };
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (2 tests in `configure` describe block)

- [x] **Step 7: Commit**

```bash
git add src/web/loadGis.ts src/web/storage.ts src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): scaffold web module with GIS script loader"
```

---

## Task 4: signIn happy path

Drive the credential callback through to a resolved `SignInResult`.

**Files:**
- Modify: `src/ExpoGoogleSigninModule.web.ts`
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add a JWT factory and a test for the happy path**

Add at the top of `src/__tests__/web.test.ts` after the imports/setup, before the existing `describe('configure', ...)`:

```ts
const b64url = (s: string) =>
  Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

const makeJwt = (payload: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: 'RS256' }))}.${b64url(JSON.stringify(payload))}.signature`;

const farFutureExp = Math.floor(Date.now() / 1000) + 3600;

function fireCredential(jwt: string) {
  const initCall = initializeFn.mock.calls.at(-1);
  const config = initCall?.[0] as { callback: (r: { credential: string }) => void };
  config.callback({ credential: jwt });
}

function fireMoment(builder: (n: Record<string, unknown>) => void) {
  const promptCall = promptFn.mock.calls.at(-1);
  const listener = promptCall?.[0] as (n: Record<string, unknown>) => void;
  const notification: Record<string, unknown> = {
    isNotDisplayed: () => false,
    isSkippedMoment: () => false,
    isDismissedMoment: () => false,
  };
  builder(notification);
  listener(notification);
}
```

Then append a new describe block:

```ts
describe('signIn', () => {
  it('resolves with idToken and decoded user on credential callback', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const jwt = makeJwt({
      sub: 'user-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
      given_name: 'Jane',
      family_name: 'Doe',
      picture: 'https://lh3.googleusercontent.com/a/photo',
      exp: farFutureExp,
    });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(jwt);
    const result = await pending;
    expect(result.idToken).toBe(jwt);
    expect(result.user).toEqual({
      id: 'user-123',
      email: 'jane@example.com',
      name: 'Jane Doe',
      givenName: 'Jane',
      familyName: 'Doe',
      photo: 'https://lh3.googleusercontent.com/a/photo',
    });
    expect(initializeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'web.apps.googleusercontent.com',
        use_fedcm_for_prompt: true,
        auto_select: false,
      })
    );
    expect(promptFn).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL with "not implemented"

- [x] **Step 3: Implement signIn**

Replace the `signIn` stub in `src/ExpoGoogleSigninModule.web.ts` with the real implementation. Also import the additional helpers at the top:

Add imports:

```ts
import { decodeIdToken } from './web/decodeIdToken';
import { writeCached } from './web/storage';
import { GoogleSigninError } from './errors';
```

And add a small mapper helper plus the new `signIn` body. Replace the `signIn` declaration:

```ts
const toUser = (jwt: string) => {
  const decoded = decodeIdToken(jwt);
  return {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name ?? null,
    givenName: decoded.given_name ?? null,
    familyName: decoded.family_name ?? null,
    photo: decoded.picture ?? null,
  };
};

const signIn = async (options: SignInOptions): Promise<SignInResult> => {
  if (!configured) {
    throw new GoogleSigninError('ERR_NOT_CONFIGURED', 'configure() was not called');
  }
  await scriptLoad;
  const google = window.google;
  if (!google) {
    throw new GoogleSigninError('ERR_UNKNOWN', 'Google Identity Services failed to load');
  }
  return new Promise<SignInResult>((resolve, reject) => {
    let settled = false;
    google.accounts.id.initialize({
      client_id: configured!.webClientId,
      callback: (response) => {
        if (settled) return;
        settled = true;
        try {
          const user = toUser(response.credential);
          const result: SignInResult = { idToken: response.credential, user };
          writeCached(result);
          resolve(result);
        } catch (err) {
          reject(new GoogleSigninError('ERR_UNKNOWN', (err as Error).message));
        }
      },
      nonce: options.nonce,
      use_fedcm_for_prompt: true,
      auto_select: false,
    });
    google.accounts.id.prompt((_notification) => {
      // Moment handling added in later tasks.
    });
  });
};
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (3 tests total — 2 for configure, 1 for signIn happy path)

- [x] **Step 5: Commit**

```bash
git add src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): web signIn happy path via GIS One Tap"
```

---

## Task 5: signIn nonce passthrough + ERR_NOT_CONFIGURED guard

Two small additions: verify `nonce` reaches `initialize`, and that calling `signIn` before `configure` rejects.

**Files:**
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add the tests**

Inside the existing `describe('signIn', ...)` block, append:

```ts
it('forwards nonce to google.accounts.id.initialize', async () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  const pending = mod.signIn({ nonce: 'hashed-nonce-abc' });
  await new Promise<void>((r) => queueMicrotask(r));
  expect(initializeFn).toHaveBeenCalledWith(
    expect.objectContaining({ nonce: 'hashed-nonce-abc' })
  );
  fireCredential(
    makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp })
  );
  await pending;
});

it('rejects with ERR_NOT_CONFIGURED when configure() was not called', async () => {
  const mod = loadModule();
  await expect(mod.signIn({})).rejects.toMatchObject({
    name: 'GoogleSigninError',
    code: 'ERR_NOT_CONFIGURED',
  });
});
```

- [x] **Step 2: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (5 tests total). No code change needed — Task 4's implementation already handles both cases.

- [x] **Step 3: Commit**

```bash
git add src/__tests__/web.test.ts
git commit -m "test(expo-google-signin): cover nonce passthrough and not-configured guard on web"
```

---

## Task 6: signIn cancellation and no-credential mapping

Wire the moment-notification listener to reject with the right error codes.

**Files:**
- Modify: `src/ExpoGoogleSigninModule.web.ts`
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add the tests**

Append to `describe('signIn', ...)`:

```ts
it('rejects with ERR_SIGN_IN_CANCELLED when user dismisses One Tap', async () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireMoment((n) => {
    n.isSkippedMoment = () => true;
    n.getSkippedReason = () => 'user_cancel';
  });
  await expect(pending).rejects.toMatchObject({
    name: 'GoogleSigninError',
    code: 'ERR_SIGN_IN_CANCELLED',
  });
});

it('rejects with ERR_SIGN_IN_CANCELLED when prompt is dismissed via cancel_called', async () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireMoment((n) => {
    n.isDismissedMoment = () => true;
    n.getDismissedReason = () => 'cancel_called';
  });
  await expect(pending).rejects.toMatchObject({ code: 'ERR_SIGN_IN_CANCELLED' });
});

it('rejects with ERR_NO_CREDENTIAL when prompt is not displayed', async () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireMoment((n) => {
    n.isNotDisplayed = () => true;
    n.getNotDisplayedReason = () => 'opt_out_or_no_session';
  });
  await expect(pending).rejects.toMatchObject({ code: 'ERR_NO_CREDENTIAL' });
});

it('rejects with ERR_UNKNOWN for other not-displayed reasons', async () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireMoment((n) => {
    n.isNotDisplayed = () => true;
    n.getNotDisplayedReason = () => 'unregistered_origin';
  });
  await expect(pending).rejects.toMatchObject({ code: 'ERR_UNKNOWN' });
});

it('ignores the credential_returned dismissal moment after credential resolves', async () => {
  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
  fireMoment((n) => {
    n.isDismissedMoment = () => true;
    n.getDismissedReason = () => 'credential_returned';
  });
  await expect(pending).resolves.toMatchObject({ idToken: expect.any(String) });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL on the four rejection cases (the credential_returned ignore case may pass since the resolver's `settled` flag already short-circuits — that's fine).

- [x] **Step 3: Implement the moment listener**

Replace the placeholder moment listener in `signIn` (the `_notification` arrow) with:

```ts
    google.accounts.id.prompt((notification) => {
      if (settled) return;
      const code = mapMomentToCode(notification);
      if (!code) return;
      settled = true;
      reject(new GoogleSigninError(code, momentReason(notification) ?? 'sign-in not completed'));
    });
```

Add the two helpers near the top of the file (after the type declarations, before the module-level state):

```ts
type Moment = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
};

const CANCEL_REASONS = new Set(['user_cancel', 'tap_outside', 'cancel_called']);
const NO_CRED_REASONS = new Set(['opt_out_or_no_session', 'suppressed_by_user']);

const momentReason = (n: Moment): string | undefined => {
  if (n.isNotDisplayed()) return n.getNotDisplayedReason?.();
  if (n.isSkippedMoment()) return n.getSkippedReason?.();
  if (n.isDismissedMoment()) return n.getDismissedReason?.();
  return undefined;
};

const mapMomentToCode = (
  n: Moment
): 'ERR_SIGN_IN_CANCELLED' | 'ERR_NO_CREDENTIAL' | 'ERR_UNKNOWN' | null => {
  const reason = momentReason(n);
  if (reason === 'credential_returned') return null;
  if (n.isSkippedMoment() || n.isDismissedMoment()) {
    if (reason && CANCEL_REASONS.has(reason)) return 'ERR_SIGN_IN_CANCELLED';
    if (reason === 'flow_restarted') return null;
    return 'ERR_UNKNOWN';
  }
  if (n.isNotDisplayed()) {
    if (reason && NO_CRED_REASONS.has(reason)) return 'ERR_NO_CREDENTIAL';
    return 'ERR_UNKNOWN';
  }
  return null;
};
```

Also import the matching error code type if helpful (not required — the helper returns a literal union).

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (10 tests total).

- [x] **Step 5: Commit**

```bash
git add src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): map GIS prompt moments to GoogleSigninError codes"
```

---

## Task 7: hostedDomain enforcement

Reject with `ERR_NO_CREDENTIAL` when the returned token's `hd` claim does not match the configured `hostedDomain`. Do not cache.

**Files:**
- Modify: `src/ExpoGoogleSigninModule.web.ts`
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add the tests**

Append to `describe('signIn', ...)`:

```ts
it('rejects with ERR_NO_CREDENTIAL when hostedDomain does not match the hd claim', async () => {
  const mod = loadModule();
  mod.configure({
    webClientId: 'web.apps.googleusercontent.com',
    hostedDomain: 'example.com',
  });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireCredential(
    makeJwt({ sub: 'x', email: 'y@other.com', hd: 'other.com', exp: farFutureExp })
  );
  await expect(pending).rejects.toMatchObject({ code: 'ERR_NO_CREDENTIAL' });
  expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
});

it('resolves when hostedDomain matches', async () => {
  const mod = loadModule();
  mod.configure({
    webClientId: 'web.apps.googleusercontent.com',
    hostedDomain: 'example.com',
  });
  const pending = mod.signIn({});
  await new Promise<void>((r) => queueMicrotask(r));
  fireCredential(
    makeJwt({ sub: 'x', email: 'y@example.com', hd: 'example.com', exp: farFutureExp })
  );
  await expect(pending).resolves.toMatchObject({ idToken: expect.any(String) });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL on the mismatch case — currently the credential is accepted and cached regardless of `hd`.

- [x] **Step 3: Implement hostedDomain enforcement**

In `src/ExpoGoogleSigninModule.web.ts`, replace the credential `callback` body inside `signIn` so the `hd` check happens before `writeCached`:

```ts
      callback: (response) => {
        if (settled) return;
        settled = true;
        try {
          const decoded = decodeIdToken(response.credential);
          if (configured!.hostedDomain && decoded.hd !== configured!.hostedDomain) {
            reject(
              new GoogleSigninError(
                'ERR_NO_CREDENTIAL',
                `hostedDomain mismatch: expected ${configured!.hostedDomain}, got ${decoded.hd ?? 'none'}`
              )
            );
            return;
          }
          const user = {
            id: decoded.sub,
            email: decoded.email,
            name: decoded.name ?? null,
            givenName: decoded.given_name ?? null,
            familyName: decoded.family_name ?? null,
            photo: decoded.picture ?? null,
          };
          const result: SignInResult = { idToken: response.credential, user };
          writeCached(result);
          resolve(result);
        } catch (err) {
          reject(new GoogleSigninError('ERR_UNKNOWN', (err as Error).message));
        }
      },
```

You can now remove the standalone `toUser` helper, since the callback inlines the mapping.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (12 tests total).

- [x] **Step 5: Commit**

```bash
git add src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): enforce hostedDomain via hd claim on web"
```

---

## Task 8: signIn rejects when GIS script fails to load

The promise from `loadGis()` rejects on `script.onerror`; `signIn` must surface that as `ERR_NETWORK`.

**Files:**
- Modify: `src/ExpoGoogleSigninModule.web.ts`
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add the test**

Append to `describe('signIn', ...)`:

```ts
it('rejects with ERR_NETWORK when the GIS script fails to load', async () => {
  appendSpy.mockReset();
  appendSpy.mockImplementation((node) => {
    if (node instanceof HTMLScriptElement && node.src.includes('gsi/client')) {
      queueMicrotask(() => node.onerror?.(new Event('error')));
    }
    return node;
  });

  const mod = loadModule();
  mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
  await expect(mod.signIn({})).rejects.toMatchObject({
    name: 'GoogleSigninError',
    code: 'ERR_NETWORK',
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL — current implementation throws an unwrapped `Error` when the script load rejects.

- [x] **Step 3: Wrap the script-load error**

In `signIn` in `src/ExpoGoogleSigninModule.web.ts`, replace the bare `await scriptLoad;` with:

```ts
  try {
    await scriptLoad;
  } catch {
    throw new GoogleSigninError('ERR_NETWORK', 'Failed to load Google Identity Services');
  }
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (13 tests total).

- [x] **Step 5: Commit**

```bash
git add src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): surface GIS script load failure as ERR_NETWORK"
```

---

## Task 9: signOut clears cache and disables auto-select

**Files:**
- Modify: `src/ExpoGoogleSigninModule.web.ts`
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add the tests**

Append to `src/__tests__/web.test.ts`:

```ts
describe('signOut', () => {
  it('clears the cached session and calls disableAutoSelect', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    fireCredential(makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp }));
    await pending;
    expect(sessionStorage.getItem('expo-google-signin:session')).not.toBeNull();

    await mod.signOut();
    expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
    expect(disableAutoSelectFn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when GIS has not loaded yet', async () => {
    const mod = loadModule();
    await expect(mod.signOut()).resolves.toBeUndefined();
    expect(disableAutoSelectFn).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL with "not implemented".

- [x] **Step 3: Implement signOut**

Add the import at the top of `src/ExpoGoogleSigninModule.web.ts`:

```ts
import { clearCached, readCached } from './web/storage';
```

(`readCached` is used by `getCurrentUser` in the next task; adding it here keeps imports tidy.)

Replace the `signOut` stub:

```ts
const signOut = async (): Promise<void> => {
  if (typeof window !== 'undefined' && window.google) {
    window.google.accounts.id.disableAutoSelect();
  }
  clearCached();
};
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (15 tests total).

- [x] **Step 5: Commit**

```bash
git add src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): implement web signOut"
```

---

## Task 10: getCurrentUser — cached, null, and expired

**Files:**
- Modify: `src/ExpoGoogleSigninModule.web.ts`
- Modify: `src/__tests__/web.test.ts`

- [x] **Step 1: Add the tests**

Append to `src/__tests__/web.test.ts`:

```ts
describe('getCurrentUser', () => {
  it('returns the cached session after a successful signIn', async () => {
    const mod = loadModule();
    mod.configure({ webClientId: 'web.apps.googleusercontent.com' });
    const pending = mod.signIn({});
    await new Promise<void>((r) => queueMicrotask(r));
    const jwt = makeJwt({ sub: 'x', email: 'y@z.com', exp: farFutureExp });
    fireCredential(jwt);
    const signed = await pending;

    const current = await mod.getCurrentUser();
    expect(current).toEqual(signed);
  });

  it('returns null when no session is cached', async () => {
    const mod = loadModule();
    await expect(mod.getCurrentUser()).resolves.toBeNull();
  });

  it('returns null and clears storage when the cached token has expired', async () => {
    const expiredJwt = makeJwt({
      sub: 'x',
      email: 'y@z.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    sessionStorage.setItem(
      'expo-google-signin:session',
      JSON.stringify({
        idToken: expiredJwt,
        user: {
          id: 'x',
          email: 'y@z.com',
          name: null,
          givenName: null,
          familyName: null,
          photo: null,
        },
      })
    );
    const mod = loadModule();
    await expect(mod.getCurrentUser()).resolves.toBeNull();
    expect(sessionStorage.getItem('expo-google-signin:session')).toBeNull();
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --testPathPattern=web.test`
Expected: FAIL with "not implemented".

- [x] **Step 3: Implement getCurrentUser**

Replace the `getCurrentUser` stub in `src/ExpoGoogleSigninModule.web.ts`:

```ts
const getCurrentUser = async (): Promise<SignInResult | null> => {
  return readCached();
};
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern=web.test`
Expected: PASS (18 tests total).

- [x] **Step 5: Commit**

```bash
git add src/ExpoGoogleSigninModule.web.ts src/__tests__/web.test.ts
git commit -m "feat(expo-google-signin): implement web getCurrentUser with exp check"
```

---

## Task 11: README — drop the disclaimer, add a Web subsection, prune the roadmap

**Files:**
- Modify: `README.md`

- [x] **Step 1: Drop "No web support yet." from the lead**

Replace this line in `README.md`:

```
A Google Sign-In package for Expo. Uses Credential Manager on Android and Google's iOS SDK (9.x) on iOS. Works with the new architecture. No web support yet.
```

With:

```
A Google Sign-In package for Expo. Uses Credential Manager on Android, Google's iOS SDK (9.x) on iOS, and Google Identity Services (One Tap / FedCM) on web. Works with the new architecture.
```

- [x] **Step 2: Add a Web subsection under Configure**

After the existing `### Client IDs` section (and before `## Usage`), append:

```markdown
### Web

No plugin step or `iosUrlScheme` is needed. Just call `configure({ webClientId })`. The package auto-injects the Google Identity Services script (`https://accounts.google.com/gsi/client`) on `configure()`, and `signIn()` triggers the One Tap / FedCM prompt.

Make sure your **Web OAuth client** in the Google Cloud Console has the page origin (e.g. `http://localhost:8081`, `https://your-app.com`) registered under *Authorized JavaScript origins*. Without it, the prompt is suppressed and you'll see `ERR_UNKNOWN` with `unregistered_origin` in the message.

`ERR_PLAY_SERVICES_UNAVAILABLE` is never emitted on web. All other error codes apply the same way they do on native.
```

- [x] **Step 3: Remove the web line from the roadmap**

In the `## Roadmap` section, delete this bullet:

```
- Web via Google Identity Services
```

Keep the other two roadmap bullets.

- [x] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(expo-google-signin): document web support"
```

---

## Task 12: Final verification

Confirm the whole test suite is green and the plugin still builds.

- [x] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS (all existing tests + 5 decodeIdToken tests + 18 web tests).

- [x] **Step 2: Type-check the package**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [x] **Step 3: Build the config plugin**

Run: `npm run build:plugin`
Expected: completes without errors — confirms nothing in the web work broke the plugin tsconfig.

- [x] **Step 4: Final sanity grep**

Run: `git grep -nE "TODO|TBD|FIXME" src/ docs/superpowers/specs/`
Expected: no matches.

- [x] **Step 5: No commit needed**

If all checks passed, the implementation is complete. The branch is ready for review.
