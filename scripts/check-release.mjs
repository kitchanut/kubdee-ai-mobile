#!/usr/bin/env node
/**
 * Guard release-metadata consistency so a version bump can't be half-applied.
 *
 * package.json is the SINGLE SOURCE OF TRUTH for the version string. This script
 * asserts every other place that carries the version agrees with it, and that
 * the top changelog entry is well-formed. Run in CI and before every release.
 *
 * Checked:
 *   - package.json.version === package-lock.json version (both spots)
 *   - package.json.version === MOBILE_CHANGELOG[0].version
 *   - app.config.ts derives `version` from package.json (not a hardcoded string)
 *   - app.config.ts android.versionCode is an integer
 *   - app.json carries no version / versionCode (must be absent — app.config.ts owns them)
 *   - MOBILE_CHANGELOG[0] has version + ISO date + highlight + non-empty changes[]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const errors = [];
const fail = (m) => errors.push(m);

// --- canonical version ---
const pkg = JSON.parse(read('package.json'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json version is not semver: "${version}"`);

// --- package-lock.json (top-level + root package entry) ---
const lock = JSON.parse(read('package-lock.json'));
if (lock.version !== version) fail(`package-lock.json .version = "${lock.version}" != "${version}"`);
const rootPkg = lock.packages?.['']?.version;
if (rootPkg && rootPkg !== version) fail(`package-lock.json packages[""].version = "${rootPkg}" != "${version}"`);

// --- app.config.ts: version must be derived from package.json, versionCode an int ---
const appConfig = read('app.config.ts');
if (!/version:\s*(require\(['"]\.\/package\.json['"]\)|pkg|packageJson)\.version/.test(appConfig)) {
  fail('app.config.ts must derive `version` from package.json (found a hardcoded string or unknown form).');
}
const vcMatch = appConfig.match(/versionCode:\s*(\d+)/);
if (!vcMatch) fail('app.config.ts is missing an integer android.versionCode.');

// --- app.json must NOT carry version / versionCode (app.config.ts owns them) ---
const appJson = JSON.parse(read('app.json'));
if (appJson.expo?.version !== undefined) fail('app.json still has expo.version — remove it (app.config.ts owns the version).');
if (appJson.expo?.android?.versionCode !== undefined) fail('app.json still has expo.android.versionCode — remove it.');

// --- changelog top entry ---
// Anchor on the array assignment so nothing matches the `version:` in the
// `interface MobileChangelogRelease` declaration above it. `firstBlock` is the
// first entry object, bounded at its closing `\n  },`.
const changelog = read('src/updates/mobileChangelog.ts');
const arrStart = changelog.indexOf('MOBILE_CHANGELOG: MobileChangelogRelease[] = [');
const region = arrStart >= 0 ? changelog.slice(arrStart) : '';
const firstEntryEnd = region.indexOf('\n  },');
const firstBlock = region.slice(0, firstEntryEnd > 0 ? firstEntryEnd : 1200);

const firstVersion = firstBlock.match(/version:\s*['"]([^'"]+)['"]/)?.[1];
if (!firstVersion) fail('could not find the first MOBILE_CHANGELOG entry version.');
else if (firstVersion !== version) fail(`MOBILE_CHANGELOG[0].version = "${firstVersion}" != package.json "${version}"`);

if (!/date:\s*['"]\d{4}-\d{2}-\d{2}['"]/.test(firstBlock)) fail('MOBILE_CHANGELOG[0] is missing an ISO date (YYYY-MM-DD).');
if (!/highlight:\s*['"].+['"]/.test(firstBlock)) fail('MOBILE_CHANGELOG[0] is missing a highlight.');
if (!/changes:\s*\[\s*{/.test(firstBlock)) fail('MOBILE_CHANGELOG[0] has an empty changes[].');

if (errors.length === 0) {
  console.log(`[release-check] OK — version ${version} consistent across package.json, lockfile, app.config.ts, changelog.`);
  process.exit(0);
}
console.error('[release-check] release metadata is inconsistent:');
for (const e of errors) console.error(`  ✗ ${e}`);
console.error('\n  package.json is the source of truth. Bump with `npm version <patch|minor|major>`,');
console.error('  add the matching MOBILE_CHANGELOG entry, and set android.versionCode in app.config.ts.');
process.exit(1);
