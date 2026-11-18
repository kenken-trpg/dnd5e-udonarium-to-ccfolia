// ESLint 設定。実行: npm run lint
import js from '@eslint/js';
import globals from 'globals';

const common = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  // 全角スペース（U+3000）を、空白判定の正規表現や表示用の文字列でわざと使っている
  'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipRegExps: true }],
};

export default [
  { ignores: ['node_modules/', 'test-results/', 'playwright-report/', '.venv/', '_site/'] },
  js.configs.recommended,
  {
    // ブラウザで <script> として読むファイル。converter.js は Node からも require する
    files: ['app.js', 'converter.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, module: 'readonly' },
    },
    rules: common,
  },
  {
    // テスト・設定（Node）。E2E の page.evaluate の中身はブラウザで動く
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: common,
  },
];
