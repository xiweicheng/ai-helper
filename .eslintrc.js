export default {
  extends: '@antfu',
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': ['warn', { varsIgnorePattern: '^_' }],
    'prefer-const': 'warn',
    'no-var': 'warn'
  },
  ignores: [
    'dist/**',
    'libs/**',
    'agent/**',
    'scripts/**'
  ]
};