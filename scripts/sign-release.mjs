#!/usr/bin/env node
/**
 * Re-sign a gradle-built release APK with signing-key rotation.
 *
 * Gradle's signingConfigs cannot express a signing lineage, so the release APK
 * comes out signed with the legacy debug key only. This script re-signs it so
 * that:
 *   - v1/v2 blocks stay signed by the legacy debug key  -> API 26-32 devices
 *     that still have a debug-signed install can update seamlessly (no reinstall)
 *   - v3 block is signed by the production key + lineage -> API 33+ devices
 *     rotate to the production key; only the production key can sign further
 *     updates, closing the public-debug-key update-hijack hole.
 *
 * ⚠️ Every release from v0.3.0 onward MUST go through this script. Shipping an
 * APK signed with the debug key alone will be rejected as an update by any
 * device that has already rotated (INSTALL_FAILED_UPDATE_INCOMPATIBLE).
 *
 * Inputs (env, with sensible local defaults):
 *   RELEASE_KEYSTORE       path to production .jks         (default signing/kubdee-release.jks)
 *   RELEASE_KEYSTORE_PASS  store+key password
 *   RELEASE_KEY_ALIAS      key alias                       (default kubdee)
 *   LINEAGE_FILE           rotation lineage                (default signing/lineage)
 *   DEBUG_KEYSTORE         legacy debug keystore           (default android/app/debug.keystore)
 *   APKSIGNER              path to apksigner               (default: auto-detect newest build-tools)
 *   ROTATION_MIN_SDK       first API level to use the new key (default 33 = apksigner default)
 *
 * Usage: node scripts/sign-release.mjs <input.apk> <output.apk>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function fail(msg) {
  console.error(`\n[sign-release] ERROR: ${msg}\n`);
  process.exit(1);
}

function detectApksigner() {
  if (process.env.APKSIGNER) return process.env.APKSIGNER;
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    '/opt/homebrew/share/android-commandlinetools',
    join(process.env.HOME ?? '', 'Library/Android/sdk'),
  ].filter(Boolean);
  for (const root of roots) {
    const buildTools = join(root, 'build-tools');
    if (!existsSync(buildTools)) continue;
    const versions = readdirSync(buildTools).sort().reverse();
    for (const v of versions) {
      const candidate = join(buildTools, v, 'apksigner');
      if (existsSync(candidate)) return candidate;
    }
  }
  fail('apksigner not found. Set APKSIGNER or ANDROID_HOME.');
}

const [input, output] = process.argv.slice(2);
if (!input || !output) fail('usage: node scripts/sign-release.mjs <input.apk> <output.apk>');
if (!existsSync(input)) fail(`input APK not found: ${input}`);

const keystore = process.env.RELEASE_KEYSTORE ?? 'signing/kubdee-release.jks';
const keystorePass = process.env.RELEASE_KEYSTORE_PASS;
const keyAlias = process.env.RELEASE_KEY_ALIAS ?? 'kubdee';
const lineage = process.env.LINEAGE_FILE ?? 'signing/lineage';
const debugKeystore = process.env.DEBUG_KEYSTORE ?? 'android/app/debug.keystore';
const rotationMinSdk = process.env.ROTATION_MIN_SDK ?? '33';
const apksigner = detectApksigner();

if (!keystorePass) fail('RELEASE_KEYSTORE_PASS is required (from a secret / password manager).');
for (const [label, path] of [['release keystore', keystore], ['lineage', lineage], ['debug keystore', debugKeystore]]) {
  if (!existsSync(path)) fail(`${label} not found: ${path}`);
}

// Copy input -> output first so apksigner signs the output in place.
execFileSync('cp', [input, output]);

const args = [
  'sign',
  '--lineage', lineage,
  // signer #1 = legacy debug key -> v1/v2 backward compat for API 26-32
  '--ks', debugKeystore, '--ks-pass', 'pass:android',
  '--ks-key-alias', 'androiddebugkey', '--key-pass', 'pass:android',
  // signer #2 = production key -> v3 + lineage for API >= rotationMinSdk
  '--next-signer',
  '--ks', keystore, '--ks-pass', `pass:${keystorePass}`,
  '--ks-key-alias', keyAlias, '--key-pass', `pass:${keystorePass}`,
  '--min-sdk-version', '26',
  '--rotation-min-sdk-version', rotationMinSdk,
  output,
];

console.log(`[sign-release] apksigner: ${apksigner}`);
console.log(`[sign-release] rotation-min-sdk: ${rotationMinSdk}`);
try {
  execFileSync(apksigner, args, { stdio: ['ignore', 'inherit', 'inherit'] });
} catch {
  fail('apksigner sign failed (see output above).');
}

// Verify the result carries both the v2 (debug) and v3 (production + lineage) layers.
const verify = execFileSync(apksigner, ['verify', '--verbose', '--print-certs', output], { encoding: 'utf8' });
const v2 = /Verified using v2 scheme.*true/.test(verify);
const v3 = /Verified using v3 scheme.*true/.test(verify);
const hasLineage = /minSdkVersion=24, maxSdkVersion=32/.test(verify) && new RegExp(`minSdkVersion=${rotationMinSdk}`).test(verify);
if (!v2 || !v3 || !hasLineage) {
  console.error(verify);
  fail(`signature verification did not show the expected rotation layers (v2=${v2} v3=${v3} lineage=${hasLineage}).`);
}

console.log(`\n[sign-release] OK -> ${output}`);
console.log('[sign-release] v2 (debug backward-compat) + v3 (production key + lineage) verified.');
