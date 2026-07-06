# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Native automation Kotlin — single source of truth

`plugins/templates/*.kt` is the **canonical source**. `android/.../automation/*.kt` is
**generated** (the config plugin renders `__PACKAGE_NAME__` at prebuild). Both are committed,
so they can silently drift and break a fresh prebuild.

- ✅ Edit Kotlin in `plugins/templates/` only, then `npx expo prebuild -p android` to regenerate `android/`.
- 🚫 Never hand-edit `android/app/src/main/java/ai/kubdee/mobile/automation/*.kt`.
- Run `npm run check:native-drift` after any native change (CI enforces it).

# Versioning — single source of truth

`package.json` owns the version **string**; `app.config.ts` reads it via `require('./package.json')`.
`app.config.ts` owns `android.versionCode` (bump it manually per release). `app.json` carries neither.

- Bump with `npm version <patch|minor|major>` (updates package.json + lockfile), then add a
  `MOBILE_CHANGELOG` entry and bump `versionCode` in `app.config.ts`.
- Run `npm run check:release` (CI enforces version/changelog consistency).
- `npm run verify` = typecheck + both guards.

# Release

Follow the runbook at `docs/MOBILE_RELEASE.md` — APK is distributed via GitHub Releases (`gh release create`), not the web admin page.

**Signing (since v0.3.0):** releases MUST be re-signed with key rotation via `scripts/sign-release.mjs`
(never ship the debug-signed gradle output). The production keystore lives in `signing/` (gitignored)
and must never be lost. See `docs/MOBILE_RELEASE.md` step 5.
