// publish-script-order.unit.test.js - 发布脚本关键顺序契约
//
// 背景：npm publish 会触发 agent/package.json 的 prepublishOnly
// （cp -r ../dist ./dist），把根目录 dist 复制进 NPM 包上传。
// 因此 publish.sh 必须保证顺序：写 version.json → 重新构建 dist → npm publish。
// 若顺序颠倒或缺少构建步骤，NPM 包内嵌的版本信息会是上一次发布的旧数据。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const script = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../agent/publish.sh'),
  'utf8',
);

const idxWriteJson = script.indexOf('fs.writeFileSync(process.env.VERSION_JSON_PATH');
const idxBuild = script.indexOf('npm run build:silent');
const idxPublish = script.indexOf('npm publish --registry');

describe('publish.sh 发布顺序契约', () => {
  it('写入 version.json 位于用户确认发布之后、npm publish 之前', () => {
    const idxConfirm = script.indexOf('确认发布');
    expect(idxConfirm).toBeGreaterThan(-1);
    expect(idxWriteJson).toBeGreaterThan(-1);
    expect(idxPublish).toBeGreaterThan(-1);
    expect(idxWriteJson).toBeGreaterThan(idxConfirm);
    expect(idxWriteJson).toBeLessThan(idxPublish);
  });

  it('重新构建 dist 位于写 version.json 之后、npm publish 之前', () => {
    expect(idxBuild).toBeGreaterThan(-1);
    expect(idxBuild).toBeGreaterThan(idxWriteJson);
    expect(idxBuild).toBeLessThan(idxPublish);
  });

  it('所有回滚 package.json 的退出路径都同时回滚 version.json（取消/构建失败/发布失败）', () => {
    // 不得存在不带 version.json 的回滚（重试循环中取消时，前一轮已写入的 JSON 也需回滚）
    const plainRollbacks = script.match(/git checkout package\.json package-lock\.json(?! "\$VERSION_JSON_PATH")/g) || [];
    expect(plainRollbacks).toHaveLength(0);
    const jsonRollbacks = script.match(/git checkout package\.json package-lock\.json "\$VERSION_JSON_PATH"/g) || [];
    expect(jsonRollbacks.length).toBeGreaterThanOrEqual(3);
  });
});
