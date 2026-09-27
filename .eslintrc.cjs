module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.3' } },
  rules: {
    'react/prop-types': 'off',
    // Apostrophes and quotes in copy render correctly; escaping them makes the
    // text harder to read in the source for no benefit.
    'react/no-unescaped-entities': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    /*
     * The one that has now cost three debugging sessions.
     *
     *   foo(bar)
     *   /regex/.test(baz)
     *
     * parses as a division, because a regex literal cannot start a line after
     * an expression. It is a SyntaxError at run time with a message that
     * points at the wrong thing entirely — and the test files are full of
     * exactly this shape. An error, not a warning: it is never intentional.
     */
    'no-unexpected-multiline': 'error',
  },
}
