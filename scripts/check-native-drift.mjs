#!/usr/bin/env node
/**
 * Guard against divergence between the canonical Kotlin templates and the
 * generated Android sources.
 *
 * `plugins/templates/*.kt` is the SINGLE SOURCE OF TRUTH. The Expo config
 * plugin renders each one into `android/.../automation/` at prebuild time by
 * replacing `__PACKAGE_NAME__`. Both trees are committed (android/ is force-added
 * past .gitignore), so they can silently drift — editing android/*.kt directly
 * builds fine with `expo run:android` until someone runs prebuild and the edit
 * is overwritten (this broke a build once, pre-v0.2.70).
 *
 * This script renders every template and diffs it against its generated twin.
 * It exits non-zero on any drift so CI / pre-commit can block it.
 *
 * Fix a drift by editing the TEMPLATE, then `npx expo prebuild -p android` to
 * regenerate android/. Never hand-edit android/.../automation/*.kt.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PACKAGE_NAME = 'ai.kubdee.mobile';
const templatesDir = join(repoRoot, 'plugins/templates');
const generatedDir = join(repoRoot, 'android/app/src/main/java/ai/kubdee/mobile/automation');

// KubdeeAccessibilityPackage.kt is generated inline by the plugin (no template),
// so it has no template twin to diff against — skip it if it appears in android/.
const GENERATED_WITHOUT_TEMPLATE = new Set(['KubdeeAccessibilityPackage.kt']);

function render(source) {
  return source.split('__PACKAGE_NAME__').join(PACKAGE_NAME);
}

if (!existsSync(generatedDir)) {
  console.error(`[native-drift] generated dir not found: ${generatedDir}`);
  console.error('[native-drift] run `npx expo prebuild -p android` first.');
  process.exit(1);
}

const templateFiles = readdirSync(templatesDir).filter((f) => f.endsWith('.kt'));
const drifted = [];
const missing = [];

for (const file of templateFiles) {
  const generatedPath = join(generatedDir, file);
  if (!existsSync(generatedPath)) {
    missing.push(file);
    continue;
  }
  const rendered = render(readFileSync(join(templatesDir, file), 'utf8'));
  const generated = readFileSync(generatedPath, 'utf8');
  if (rendered !== generated) drifted.push(file);
}

// Flag generated automation files that have no template (except known inline ones)
// — a sign someone added a .kt to android/ without a matching template.
const orphans = readdirSync(generatedDir)
  .filter((f) => f.endsWith('.kt'))
  .filter((f) => !templateFiles.includes(f) && !GENERATED_WITHOUT_TEMPLATE.has(f));

if (drifted.length === 0 && missing.length === 0 && orphans.length === 0) {
  console.log(`[native-drift] OK — ${templateFiles.length} templates match android/ (rendered).`);
  process.exit(0);
}

console.error('[native-drift] DRIFT DETECTED between plugins/templates/ and android/');
if (drifted.length) console.error(`  ✗ differ:  ${drifted.join(', ')}`);
if (missing.length) console.error(`  ✗ missing in android/: ${missing.join(', ')}`);
if (orphans.length) console.error(`  ✗ in android/ without a template: ${orphans.join(', ')}`);
console.error('\n  templates/ is the source of truth. Edit the template, then:');
console.error('    npx expo prebuild -p android   # regenerates android/');
console.error('  Never hand-edit android/.../automation/*.kt.');
process.exit(1);
