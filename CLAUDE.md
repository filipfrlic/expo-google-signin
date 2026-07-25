# CLAUDE.md

Guidance for working in this repo.

## What this is

`@filipfrlic/expo-google-signin` — a Google Sign-In package for Expo. One TypeScript
API (`configure`, `signIn`, `signOut`, `getCurrentUser`, `renderGoogleSignInButton`)
over three platform implementations: Credential Manager on Android, the GoogleSignIn
SDK 9.x on iOS, and Google Identity Services on web.

## Commands

```bash
npm test              # jest
npm run typecheck     # tsc --noEmit
npm run build:plugin  # compile plugin/src -> plugin/build (also runs via `prepare`)
```

## Architecture

**Platform resolution.** `src/index.ts` imports from `./ExpoGoogleSigninModule` and
never branches on platform. Metro and webpack pick the file:

- `src/ExpoGoogleSigninModule.ts` — native, `requireNativeModule('ExpoGoogleSignin')`
- `src/ExpoGoogleSigninModule.web.ts` — web, pure JS over GIS

Anything added to one must be added to the other, even if the other only throws.
`renderGoogleSignInButton` is the existing example: real on web, throws
`ERR_UNKNOWN` on native so the import never dangles.

**Web helpers** live in `src/web/` — `loadGis` (script injection, idempotent),
`storage` (`sessionStorage` cache with an `exp` check), `decodeIdToken` (base64url
JWT payload decode). Keep them dependency-free and independently testable.

**Errors.** Everything thrown crosses `mapNativeError` and surfaces as
`GoogleSigninError` with a stable `code`. Adding a code means updating both the
`ErrorCode` union in `src/types.ts` and `KNOWN_CODES` in `src/errors.ts` — the
exhaustiveness assertion in `errors.ts` fails the typecheck if you forget.

Consumers are told to branch on `error.code`, never `instanceof`, because Metro
bundles and hot reload can produce multiple module realms. Don't document
`instanceof` as a supported check.

## Native

Android and iOS source is real native code with no test coverage here — CI only runs
the TypeScript suite. Changes to `android/src` or `ios/` need a manual build against
a real app. Both sides must keep returning the same `SignInResult` shape; on Android
the `id` field is decoded from the ID token's `sub` claim, falling back to email.

The config plugin (`plugin/src/withGoogleSignin.ts`) only adds the reversed iOS client
ID to `CFBundleURLTypes`. Plugin changes require a prebuild / native rebuild to take
effect — a JS reload won't pick them up.

## Releases

`npm version <x.y.z>` triggers the `version` script, which syncs
`android/build.gradle`'s `version` to match `package.json` and stages it. Publishing
happens on GitHub release via `.github/workflows/publish.yml`, which verifies the tag
matches `package.json` before running `npm publish`.

When adding files that must ship, update the `files` array in `package.json` — 0.2.1
was a patch release solely because `src/web/*.ts` was missing from the tarball.
Verify with `npm pack --dry-run`.

Update `CHANGELOG.md` under `## [Unreleased]` as changes land.

## Conventions

- Commits: `type(expo-google-signin): summary`
- Design specs and plans live in `docs/superpowers/`
- Tests are colocated in `src/__tests__/`; web suites share the GIS mock harness in
  `src/__tests__/helpers/gisHarness.ts`
