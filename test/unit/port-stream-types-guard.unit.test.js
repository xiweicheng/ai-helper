// 源码守卫：流式定向端口的类型白名单必须与 background 的发送面一致。
//
// 背景：sendStreamMessage 在"会话有面板端口"时只投端口、不广播。面板侧
// PORT_STREAM_TYPES 是唯一的接收白名单——一旦 background 新增了走该出口的
// 消息类型而没同步白名单，表现是"有面板时该消息被静默丢弃，关掉面板反而正常"，
// 极难排查。这条测试把两侧钉在一起。
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BG_DIR = path.join(ROOT, 'src/background');
const CHAT_MANAGER = path.join(ROOT, 'src/side_panel/chat-manager.js');

// 面板 whitelist 的权威清单（顺序无关）。增删类型必须同时改这里，形成显式审阅点。
const EXPECTED_PORT_STREAM_TYPES = [
  'AGENT_STREAM',
  'AGENT_STREAM_DONE',
  'API_COMPLETE',
  'API_ERROR',
  'API_RETRYING',
  'STREAM_CHUNK',
  'STREAM_DONE',
  'STREAM_START',
  'STREAM_TOOL_CALL',
  'STREAM_TOOL_RESULT',
];

// 这些 stream 类消息不走面板端口（例如 STREAM_PRESELECT 是预筛选卡片，发给内容脚本/浮层，
// 走广播）。新增的 stream 类类型必须显式登记在这里或加入上面的面板白名单，二者之外一律报错。
const NON_PORT_TYPES = ['STREAM_PRESELECT'];

function readPanelTypes() {
  const src = fs.readFileSync(CHAT_MANAGER, 'utf8');
  const block = src.match(/const PORT_STREAM_TYPES = new Set\(\[([\s\S]*?)\]\);/);
  expect(block, '没找到 PORT_STREAM_TYPES 定义').toBeTruthy();
  return (block[1].match(/'([A-Z0-9_]+)'/g) || [])
    .map((s) => s.replace(/'/g, ''))
    .sort();
}

// 收集 background 里所有 stream 类消息类型，覆盖两种产生方式：
//   1) 对象字面量：{ type: 'STREAM_CHUNK', ... }
//   2) 前缀拼接：  this._typePrefix + 'STREAM_CHUNK'（StreamController 的常规产出方式）
// 只匹配以 STREAM / AGENT_STREAM / API_ 开头、且以字母数字结尾的完整标识符，
// 避免把 'STREAM_' 这种拼接片段误当成类型。
const STREAM_TYPE_PATTERN = '(?:STREAM|AGENT_STREAM|API_)(?:_?[A-Z0-9]+)*';

function readBackgroundStreamLikeTypes() {
  const types = new Set();
  for (const file of fs.readdirSync(BG_DIR)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(BG_DIR, file), 'utf8');
    for (const m of src.matchAll(new RegExp(`type:\\s*'(${STREAM_TYPE_PATTERN})'`, 'g'))) types.add(m[1]);
    for (const m of src.matchAll(new RegExp(`\\+\\s*'(${STREAM_TYPE_PATTERN})'`, 'g'))) types.add(m[1]);
  }
  return [...types].sort();
}

describe('PORT_STREAM_TYPES 与 background 发送面一致', () => {
  test('面板白名单与权威清单完全一致', () => {
    expect(readPanelTypes()).toEqual([...EXPECTED_PORT_STREAM_TYPES].sort());
  });

  test('background 里每个 stream 类类型都已显式归类（端口或非端口）', () => {
    const declared = new Set([...readPanelTypes(), ...NON_PORT_TYPES]);
    const unknown = readBackgroundStreamLikeTypes().filter((t) => !declared.has(t));
    expect(unknown, `这些类型既不在面板白名单也不在非端口清单：${unknown.join(', ')}`).toEqual([]);
  });

  test('白名单里的每个类型都确实由 background 发出（防止死条目）', () => {
    const bgSources = fs.readdirSync(BG_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => fs.readFileSync(path.join(BG_DIR, f), 'utf8'))
      .join('\n');
    const orphans = EXPECTED_PORT_STREAM_TYPES.filter((t) => !bgSources.includes(`'${t}'`));
    expect(orphans, `白名单里这些类型在 background 已不存在：${orphans.join(', ')}`).toEqual([]);
  });
});
