/**
 * ESLint 9, flat config. The same rules as the .eslintrc.cjs this replaced:
 * ESLint 8's recommended set, the React plugin's recommended and JSX-runtime
 * sets, and the settings below. `npm run lint` checks src and tests.
 *
 * package.json overrides minimatch to 11.0.3. ESLint 9, its config packages
 * and eslint-plugin-react still ask for minimatch 3, and every minimatch
 * before 11.0.1 carries a denial-of-service advisory (GHSA-g3hv-75wg-m249).
 * ESLint only uses its Minimatch class, which 11 still has. The React plugin
 * calls minimatch() as a function, which 11 no longer is, but only in rules
 * not switched on here (forbid-component-props, jsx-handler-names,
 * jsx-pascal-case, no-danger, no-unstable-nested-components): switching one
 * of those on with a pattern option needs the override looked at first.
 */
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import globals from 'globals'

export default [
  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    // ESLint 8 did not report an eslint-disable comment with nothing to
    // disable; 9 does, by default. Kept as it was.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    settings: { react: { version: '18.3' } },
    rules: {
      // ESLint 9's recommended set moved by four rules each way. These keep
      // it exactly ESLint 8's: the four it dropped, back on, and the four it
      // added, off (they pass today; switching them on is a separate choice).
      'no-extra-semi': 'error',
      'no-inner-declarations': 'error',
      'no-mixed-spaces-and-tabs': 'error',
      'no-new-symbol': 'error',
      'no-constant-binary-expression': 'off',
      'no-empty-static-block': 'off',
      'no-new-native-nonconstructor': 'off',
      'no-unused-private-class-members': 'off',
      'react/prop-types': 'off',
      // Apostrophes and quotes in copy render correctly; escaping them makes
      // the text harder to read in the source for no benefit.
      'react/no-unescaped-entities': 'off',
      // caughtErrors: 'none' was ESLint 8's default, kept so a `catch (err)`
      // that ignores err stays quiet as it always has.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      /*
       * The one that has now cost three debugging sessions.
       *
       *   foo(bar)
       *   /regex/.test(baz)
       *
       * parses as a division, because a regex literal cannot start a line
       * after an expression. It is a SyntaxError at run time with a message
       * that points at the wrong thing entirely — and the test files are full
       * of exactly this shape. An error, not a warning: it is never
       * intentional.
       */
      'no-unexpected-multiline': 'error',
    },
  },
]
