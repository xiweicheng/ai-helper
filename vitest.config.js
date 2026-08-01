// vitest.config.js - 单元测试配置
// content/*.test.js 用文件头 `// @vitest-environment jsdom` 覆盖为 jsdom 环境
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup/chrome-mock.js', './test/setup/jsdom-globals.js'],
    include: ['test/unit/**/*.test.js'],
  },
});
