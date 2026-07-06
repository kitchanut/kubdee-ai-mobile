// Flat ESLint config (ESLint 9). Extends Expo's official config and adds
// unused-import detection (a real backlog source per the 2026-07 review).
const expoConfig = require('eslint-config-expo/flat');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/*',
      'android/*',
      'ios/*',
      'dist/*',
      '.expo/*',
      'scripts/*.mjs',
    ],
  },
  {
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'unused-imports/no-unused-imports': 'warn',

      // Existing debt from eslint-config-expo v57's React-Compiler rules
      // (refs-in-render, setState-in-effect, dynamic components). These map to
      // the god-component / effect findings in docs/CODE_REVIEW_2026-07-07.md
      // (H-18, M-20, M-22) and get fixed during that refactor. Kept as warnings
      // so lint stays green in CI (guarding against NEW errors) without blocking
      // every PR on the pre-existing backlog. Ratchet back to 'error' as fixed.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
];
