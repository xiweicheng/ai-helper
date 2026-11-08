// agent/test/unit/version-compat.unit.test.js
// 版本兼容纯逻辑：~x.y.z 区间解析 / 版本比较 / 降级判定 / npm view 输出解析
// 运行：node --test agent/test/unit/version-compat.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTargetRange,
  buildFallbackTarget,
  compareVersions,
  isMajorMinorAhead,
  isUpdateAvailable,
  pickLatestVersion,
  parseNpmViewVersions
} from '../../src/version-compat.js';

describe('parseTargetRange', () => {
  test('接受 ~x.y.z 并拆出 major/minor/patch', () => {
    const r = parseTargetRange('~2.7.10');
    assert.deepEqual(r, { raw: '~2.7.10', version: '2.7.10', major: 2, minor: 7, patch: 10 });
  });

  test('去掉首尾空白', () => {
    assert.equal(parseTargetRange('  ~2.7.10  ').version, '2.7.10');
  });

  test('拒绝非 ~ 前缀、缺段、预发布和注入字符串', () => {
    for (const bad of ['2.7.10', '~2.7', '~2.7.10-beta', '~2.7.10; rm -rf /', '', null, 123]) {
      assert.equal(parseTargetRange(bad), null);
    }
  });
});

describe('buildFallbackTarget', () => {
  test('锚定代理自身 major.minor.patch', () => {
    assert.equal(buildFallbackTarget('2.7.10'), '~2.7.10');
    assert.equal(buildFallbackTarget('2.7.10-beta.1'), '~2.7.10');
  });

  test('无法解析时返回空串', () => {
    assert.equal(buildFallbackTarget('unknown'), '');
    assert.equal(buildFallbackTarget(null), '');
  });
});

describe('compareVersions', () => {
  test('按 major/minor/patch 比较', () => {
    assert.ok(compareVersions('2.7.11', '2.7.10') > 0);
    assert.ok(compareVersions('2.8.0', '2.7.99') > 0);
    assert.ok(compareVersions('3.0.0', '2.9.9') > 0);
    assert.equal(compareVersions('2.7.10', '2.7.10'), 0);
    assert.ok(compareVersions('2.7.9', '2.7.10') < 0);
  });
});

describe('isMajorMinorAhead', () => {
  test('major/minor 更高才判定为领先（patch 更高不算）', () => {
    assert.equal(isMajorMinorAhead('2.8.0', '2.7.10'), true);
    assert.equal(isMajorMinorAhead('3.0.0', '2.7.10'), true);
    assert.equal(isMajorMinorAhead('2.7.12', '2.7.10'), false);
    assert.equal(isMajorMinorAhead('2.6.12', '2.7.10'), false);
  });
});

describe('isUpdateAvailable', () => {
  test('latest 高于 current 才提示可升级', () => {
    assert.equal(isUpdateAvailable('2.7.10', '2.7.11'), true);
    assert.equal(isUpdateAvailable('2.7.10', '2.7.10'), false);
    assert.equal(isUpdateAvailable('2.7.10', ''), false);
  });
});

describe('pickLatestVersion', () => {
  test('从字符串/数组挑最高版本并忽略非法项', () => {
    assert.equal(pickLatestVersion('2.7.10'), '2.7.10');
    assert.equal(pickLatestVersion(['2.7.9', '2.7.11', '2.7.10']), '2.7.11');
    assert.equal(pickLatestVersion(['2.7.9', 'bad', null]), '2.7.9');
    assert.equal(pickLatestVersion(null), '');
  });

  test('拒绝带尾随字符的版本（会被拼进 npm 参数）', () => {
    assert.equal(pickLatestVersion('2.7.10; rm -rf /'), '');
    assert.equal(pickLatestVersion('2.7.10x'), '');
    assert.equal(pickLatestVersion(['2.7.9', '2.7.10 && echo pwned']), '2.7.9');
  });

  test('允许预发布版本号', () => {
    assert.equal(pickLatestVersion('2.7.10-beta.1'), '2.7.10-beta.1');
  });
});

describe('parseNpmViewVersions', () => {
  test('解析单个版本字符串', () => {
    assert.equal(parseNpmViewVersions('"2.7.10"'), '2.7.10');
  });

  test('解析数组并取最高 patch', () => {
    assert.equal(parseNpmViewVersions('["2.7.9","2.7.11","2.7.10"]'), '2.7.11');
  });

  test('跳过 npm 前导提示后再解析', () => {
    assert.equal(parseNpmViewVersions('npm notice update available\n["2.7.10","2.7.12"]'), '2.7.12');
  });

  test('前导提示含引号时仍能解析', () => {
    assert.equal(parseNpmViewVersions('npm notice "new version" available\n["2.7.10","2.7.12"]'), '2.7.12');
    assert.equal(parseNpmViewVersions('npm notice says "hi"\n"2.7.10"'), '2.7.10');
  });

  test('空输出/非法 JSON 返回空串', () => {
    assert.equal(parseNpmViewVersions(''), '');
    assert.equal(parseNpmViewVersions('not json'), '');
    assert.equal(parseNpmViewVersions(null), '');
  });
});
