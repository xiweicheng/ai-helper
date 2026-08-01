// test/e2e/helpers/load-module.js
// 用 esbuild 把 content script 模块打包为 IIFE，注入页面后挂到 window.__tools
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

let bundleCache = null;

export async function getContentBundle() {
  if (bundleCache) return bundleCache;
  const entry = `
import * as PageUtils from './src/content/page-utils.js';
import * as ShadowDomUtils from './src/content/shadow-dom-utils.js';
import * as PageInteraction from './src/content/page-interaction.js';
import * as PageExtract from './src/content/page-extract.js';
import * as InteractionTools from './src/content/interaction-tools.js';
window.__tools = Object.assign({}, PageUtils, ShadowDomUtils, PageInteraction, PageExtract, InteractionTools);
`;
  const result = await build({
    stdin: { contents: entry, resolveDir: ROOT },
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2020',
    platform: 'browser',
  });
  bundleCache = result.outputFiles[0].text;
  return bundleCache;
}

// 在已注入 bundle 的 page 上调用工具函数，返回其结果
export async function callTool(page, fnName, ...args) {
  return page.evaluate(({ fn, a }) => window.__tools[fn](...a), { fn: fnName, a: args });
}
