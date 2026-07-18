export default [
  {
    ignores: ['dist/**', 'libs/**', 'agent/**', 'scripts/**']
  },
  {
    rules: {
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-obj-calls': 'error'
    }
  }
];