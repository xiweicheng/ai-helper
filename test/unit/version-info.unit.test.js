// version-info.unit.test.js - 侧边栏「版本信息」弹窗的纯函数与数据契约
//
// 数据契约：src/config/version.json 由 agent/publish.sh 在 git 提交/打 tag 前写入，
// 扩展构建时打包进产物；弹窗展示的版本信息即「该构建对应的发布版本」。
// 本测试守护字段形状、容错（缺字段不崩溃）与展示格式化行为。
import { describe, it, expect } from 'vitest';
import { normalizeVersionMeta, formatPublishedAt } from '../../src/side_panel/version-info.js';
import versionMeta from '../../src/config/version.json';

describe('normalizeVersionMeta', () => {
  it('完整合法输入 → 各字段原样保留', () => {
    const meta = normalizeVersionMeta({
      version: '1.17.3',
      tag: 'v1.17.3',
      commitId: '2fe94fbb5d170b30b862b9eecde0a4dc7370c797',
      publishedAt: '2026-10-06T10:01:29.000Z',
    });
    expect(meta).toEqual({
      version: '1.17.3',
      tag: 'v1.17.3',
      commitId: '2fe94fbb5d170b30b862b9eecde0a4dc7370c797',
      publishedAt: '2026-10-06T10:01:29.000Z',
    });
  });

  it('null / undefined / 非对象输入 → 全部字段为空字符串（不抛错）', () => {
    const empty = { version: '', tag: '', commitId: '', publishedAt: '' };
    expect(normalizeVersionMeta(null)).toEqual(empty);
    expect(normalizeVersionMeta(undefined)).toEqual(empty);
    expect(normalizeVersionMeta('oops')).toEqual(empty);
  });

  it('字段为非字符串 / 缺失 → 仅输出约定的四个键，缺失字段为空字符串', () => {
    const meta = normalizeVersionMeta({ version: 1173, tag: null, extra: 'x' });
    expect(meta).toEqual({ version: '', tag: '', commitId: '', publishedAt: '' });
  });

  it('字符串前后空白被去除', () => {
    const meta = normalizeVersionMeta({ version: ' 1.17.3 ' });
    expect(meta.version).toBe('1.17.3');
  });
});

describe('formatPublishedAt', () => {
  it('合法 ISO 时间 → 本地化时间字符串（含年份）', () => {
    const text = formatPublishedAt('2026-10-06T10:01:29.000Z');
    expect(text).not.toBe('—');
    expect(text).toContain('2026');
  });

  it('非法日期字符串 → — 占位符', () => {
    expect(formatPublishedAt('not-a-date')).toBe('—');
  });

  it('空字符串 → — 占位符', () => {
    expect(formatPublishedAt('')).toBe('—');
  });
});

describe('src/config/version.json 发布数据契约', () => {
  it('version 为非空字符串且形如 semver', () => {
    expect(versionMeta.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('tag 与 version 对应（v + version）', () => {
    expect(versionMeta.tag).toBe(`v${versionMeta.version}`);
  });

  it('commitId 为 40 位十六进制完整 git commit id', () => {
    expect(versionMeta.commitId).toMatch(/^[0-9a-f]{40}$/);
  });

  it('publishedAt 为可解析的 ISO 时间', () => {
    expect(Number.isNaN(Date.parse(versionMeta.publishedAt))).toBe(false);
  });
});
