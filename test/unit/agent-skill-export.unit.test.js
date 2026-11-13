// Agent Skill ZIP 导出：保留标准目录、资源文件与二进制内容，并可被现有 ZIP 导入恢复
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import * as markdownLoader from '../../agent/src/skill/markdown-loader.js';

const { importMarkdownSkillFromZip } = markdownLoader;

const SKILL_MD = `---
name: demo-skill
description: Export test
version: 1.2
---

# Demo Skill

Use the bundled resources.`;

let tempRoot;
let skillDir;
let importDir;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'agent-skill-export-'));
  skillDir = join(tempRoot, 'source', 'demo-skill');
  importDir = join(tempRoot, 'imported');
  mkdirSync(join(skillDir, 'scripts'), { recursive: true });
  mkdirSync(join(skillDir, 'assets'), { recursive: true });
  mkdirSync(importDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), SKILL_MD);
  writeFileSync(join(skillDir, 'scripts', 'run.sh'), '#!/bin/sh\necho demo\n');
  writeFileSync(join(skillDir, 'assets', 'pixel.bin'), Buffer.from([0, 255, 1, 2, 128]));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('Agent Skill ZIP 导出', () => {
  it('打包顶层技能目录、SKILL.md 和全部资源，且支持现有 ZIP 导入回环', async () => {
    expect(markdownLoader.exportMarkdownSkillToZip).toBeTypeOf('function');

    const zipBuffer = await markdownLoader.exportMarkdownSkillToZip(skillDir);
    const zip = await JSZip.loadAsync(zipBuffer);

    expect(zip.file('demo-skill/SKILL.md')).toBeTruthy();
    expect(zip.file('demo-skill/scripts/run.sh')).toBeTruthy();
    expect(zip.file('demo-skill/assets/pixel.bin')).toBeTruthy();
    expect(await zip.file('demo-skill/SKILL.md').async('string')).toBe(SKILL_MD);
    expect(Buffer.from(await zip.file('demo-skill/assets/pixel.bin').async('uint8array')))
      .toEqual(Buffer.from([0, 255, 1, 2, 128]));

    const imported = await importMarkdownSkillFromZip(importDir, zipBuffer);
    expect(imported.success).toBe(true);
    expect(readFileSync(join(importDir, 'demo-skill', 'SKILL.md'), 'utf8')).toBe(SKILL_MD);
    expect(readFileSync(join(importDir, 'demo-skill', 'assets', 'pixel.bin')))
      .toEqual(Buffer.from([0, 255, 1, 2, 128]));
  });
});
