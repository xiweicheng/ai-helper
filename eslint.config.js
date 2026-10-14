export default [
  {
    // agent 子包纳入 lint（历史上整块被 ignores 掉，等于 agent 代码没有任何静态检查）；
    // 只排除依赖与产物，避免扫 node_modules 里的第三方代码
    ignores: ['dist/**', 'libs/**', 'scripts/**', 'agent/node_modules/**', 'agent/dist/**']
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