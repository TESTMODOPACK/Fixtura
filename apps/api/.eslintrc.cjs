module.exports = {
  root: true,
  extends: ['@fixtura/config/eslint.base'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    'no-console': 'off',
  },
};
