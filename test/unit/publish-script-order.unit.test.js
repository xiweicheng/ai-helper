// publish-script-order.unit.test.js - 发布脚本关键顺序契约
//
// 背景：npm publish 会触发 agent/package.json 的 prepublishOnly
// （cp -r ../dist ./dist），把根目录 dist 复制进 NPM 包上传。
// 因此 publish.sh 必须保证顺序：写 version.json → 重新构建 dist → npm publish。
// 若顺序颠倒或缺少构建步骤，NPM 包内嵌的版本信息会是上一次发布的旧数据。
//
// 版本同步契约（单一版本流）：升级时须把根目录 package.json / package-lock.json /
// manifest.json 同步为新版本号，且必须先于重新构建（dist/manifest.json 由构建生成）；
// 全部回滚路径与最终提交都须覆盖根目录这三个文件。
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
const idxRootSync = script.indexOf('(cd .. && npm version');
const idxManifestSync = script.indexOf('fs.readFileSync("../manifest.json"');

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

  it('根目录版本同步（package.json / package-lock.json / manifest.json）发生在重新构建之前', () => {
    expect(idxRootSync).toBeGreaterThan(-1);
    expect(idxManifestSync).toBeGreaterThan(-1);
    expect(idxRootSync).toBeLessThan(idxBuild);
    expect(idxManifestSync).toBeGreaterThan(idxRootSync);
    expect(idxManifestSync).toBeLessThan(idxBuild);
  });

  it('全部回滚路径都恢复根目录 package.json / package-lock.json / manifest.json', () => {
    const rollbacks = script.match(
      /git checkout package\.json package-lock\.json "\$VERSION_JSON_PATH"(?: \\\n\s+\.\.\/package\.json \.\.\/package-lock\.json \.\.\/manifest\.json)?/g,
    ) || [];
    expect(rollbacks.length).toBeGreaterThanOrEqual(3);
    for (const rollback of rollbacks) {
      expect(rollback).toContain('../package.json');
      expect(rollback).toContain('../package-lock.json');
      expect(rollback).toContain('../manifest.json');
    }
  });

  it('发布提交包含 agent/ 与根目录全部版本文件', () => {
    const addBlock = script.match(/git add package\.json package-lock\.json "\$VERSION_JSON_PATH"(?: \\\n\s+[^\n]+)?/);
    expect(addBlock).not.toBeNull();
    expect(addBlock[0]).toContain('../package.json');
    expect(addBlock[0]).toContain('../package-lock.json');
    expect(addBlock[0]).toContain('../manifest.json');
  });
});
