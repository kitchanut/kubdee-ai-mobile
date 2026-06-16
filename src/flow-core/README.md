# @kubdee/flow-core

Shared, **platform-agnostic** Google Flow page-automation logic — the DOM logic
that runs *inside* the Google Flow page (`labs.google/fx/tools/flow`).

## Why this exists

Google Flow changes its UI often, which breaks selectors and click strategies.
Keeping that logic in one place means a UI break is **fixed once** for every
consumer instead of once per app.

## What belongs here (and what does NOT)

| ✅ Belongs here | ❌ Does NOT belong here |
|---|---|
| Selectors (`selectors.ts`) | WebView / postMessage bridge |
| In-page DOM logic (find Slate editor, fiber `insertText`, find & click submit) | Playwright / CDP plumbing |
| Action body strings + result types | Electron / React Native lifecycle |

**Rule:** this module stays **pure TypeScript with zero runtime dependencies**.
No `react`, `react-native`, `electron`, or `playwright` imports — ever. That
purity is what lets it become a standalone package without a rewrite.

## Consumers

```ts
import { buildActionScript, getActionBody } from '@kubdee/flow-core';

// Mobile (react-native-webview) — result returns via postMessage:
webviewRef.injectJavaScript(buildActionScript(id, 'fillPrompt', { prompt }));

// Desktop (Playwright / CDP), later — result returned directly:
await page.evaluate(`(async (args) => { ${getActionBody('fillPrompt')} })(${JSON.stringify({ prompt })})`);
```

## Current status

- **mobile** (`kubdee-ai-mobile`): consuming this now via the `@kubdee/flow-core`
  tsconfig path alias → `src/flow-core`.
- **desktop** (`kubdee-oneclick`): still uses its own `flows/googleFlow/actions/*.ts`.
  It will migrate gradually, one action at a time (needs heavy testing).

## Promotion to a real package (future)

When desktop is ready to share:

1. `git init` this folder → push to `kitchanut/kubdee-flow-core`, tag a version.
2. In each app's `package.json`:
   `"@kubdee/flow-core": "github:kitchanut/kubdee-flow-core#v0.1.0"`.
3. In `kubdee-ai-mobile`: remove the `@kubdee/flow-core` entries from
   `tsconfig.json` `paths` and delete `src/flow-core`.

The import specifier `@kubdee/flow-core` stays identical — **no consumer code
changes.**
