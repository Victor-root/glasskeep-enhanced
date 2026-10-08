import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'android']),
  {
    files: ['**/*.{js,jsx,cjs,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest' },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // The app: browser ES modules with React.
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite(),
    ],
    languageOptions: {
      // __APP_VERSION__ is replaced at build time (vite.config.js define).
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Server and maintenance scripts: Node.js CommonJS.
  {
    files: ['server/**/*.js', 'docker/*.js', '**/*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },
  // Build configuration: Node.js ES modules.
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },
  // Tests: Node.js ES modules that also hand functions to a browser page.
  {
    files: ['test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, sourceType: 'module' },
  },
  // Layered onto the generated service worker through importScripts.
  {
    files: ['public/*.js'],
    languageOptions: { globals: globals.serviceworker, sourceType: 'script' },
  },
  // The presentation site's classic scripts.
  {
    files: ['website/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
])
