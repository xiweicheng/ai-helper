// 子任务展开后的「当前执行节点」动效回归测试
//
// 需求（真机反馈）：展开子任务后，节点列表里只有一条在跑，但它的状态位是静态 ○，
// 而整张卡片本来就有 pulse-text 呼吸（所有行一起呼吸），用户根本分不出"到底是这一条"。
//
// 方案：把「前面的图标状态」做成动效——状态位换旋转环 + 节点图标脉冲 + 整行呼吸底（左侧光条）。
// 关键约束（防止两类回归）：
//   1) 动效必须限定在 .subtask-progress-active（卡片运行态）作用域内。基础规则自带 animation
//      会让完成的子任务里"取消/未完成"节点一直转圈，看起来还在跑。
//   2) 取消链路 finalizeCancelledStream 要摘掉活动态并把状态位还原成静态 ○，
//      否则用户点了停止，界面还在转。
// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const CHAT_MANAGER_SRC = readFileSync(resolve(root, 'src/side_panel/chat-manager.js'), 'utf8');
const CHAT_STREAMING_SRC = readFileSync(resolve(root, 'src/side_panel/chat-streaming.js'), 'utf8');
const STYLES_SRC = readFileSync(resolve(root, 'src/side_panel/styles.css'), 'utf8');

/** 取 [startAnchor, endAnchor) 之间的源码片段，锚点缺失直接判失败 */
function sliceBetween(src, startAnchor, endAnchor, label) {
  const start = src.indexOf(startAnchor);
  expect(start, `${label}: 缺少起点锚「${startAnchor}」`).toBeGreaterThan(-1);
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  expect(end, `${label}: 缺少终点锚「${endAnchor}」`).toBeGreaterThan(start);
  return src.slice(start, end);
}

// 新增动效样式集中在「当前执行节点强调」注释块里，到基础 .subtask-node-name 规则前结束
// （终点锚带前导换行：避免命中 .subtask-progress-active ... .subtask-node-name 那条新规则）
const ANIM_CSS = sliceBetween(STYLES_SRC, '/* 当前执行节点强调', '\n.subtask-node-name {', '动效样式块');

describe('节点状态位：执行中不再是静态 ○', () => {
  test('卡片运行中才落成旋转环，success/failed 仍为 ✓/✗', () => {
    // 三元链：success → ✓，failed → ✗，其余看卡片是否还在跑
    expect(CHAT_MANAGER_SRC).toMatch(
      /node\.status === 'success' \? '✓' : node\.status === 'failed' \? '✗'\s*\n\s*: \(isRunning \? '<span class="subtask-node-spinner"><\/span>' : '○'\)/
    );
  });
  test('卡片结束后未完成节点回落静态 ○（不装作还在加载）', () => {
    const idx = CHAT_MANAGER_SRC.indexOf("const stIcon = node.status === 'success'");
    expect(idx).toBeGreaterThan(-1);
    const snippet = CHAT_MANAGER_SRC.slice(idx, idx + 260);
    expect(snippet).toContain(": '○'");
  });
  test('旋转环坐在状态位槽里（subtask-node-status 内插 stIcon）', () => {
    expect(CHAT_MANAGER_SRC).toContain('class="subtask-node-status">${stIcon}');
  });
});

describe('样式：动效只在卡片运行态生效', () => {
  test('旋转环基础规则不带 animation，仅在 .subtask-progress-active 下旋转', () => {
    const baseRule = sliceBetween(ANIM_CSS, '.subtask-node-spinner {', '}', '旋转环基础规则');
    expect(baseRule).not.toMatch(/animation/);
    expect(ANIM_CSS).toMatch(
      /\.subtask-progress-active \.subtask-node-spinner \{[\s\S]{0,80}animation: subtask-spin/
    );
  });
  test('整行呼吸底 + 左侧光条限定在 active 作用域', () => {
    expect(ANIM_CSS).toMatch(
      /\.subtask-progress-active \.subtask-node\.processing \{[\s\S]{0,80}animation: subtaskNodeBreathe/
    );
    const keyframes = sliceBetween(ANIM_CSS, '@keyframes subtaskNodeBreathe {', '}', '呼吸 keyframes');
    expect(keyframes).toMatch(/background: rgba\(var\(--brand-violet-rgb\)/);
    expect(keyframes).toMatch(/box-shadow: inset 2px 0 0 rgba\(var\(--brand-violet-rgb\)/);
  });
  test('节点图标脉冲限定在 active 作用域', () => {
    expect(ANIM_CSS).toMatch(
      /\.subtask-progress-active \.subtask-node\.processing \.subtask-node-icon \{[\s\S]{0,80}animation: subtaskNodeIconPulse/
    );
    expect(ANIM_CSS).toMatch(/@keyframes subtaskNodeIconPulse \{/);
  });
  test('当前节点行文字加粗提亮，进一步拉开与已完成行的差距', () => {
    expect(ANIM_CSS).toMatch(
      /\.subtask-progress-active \.subtask-node\.processing \.subtask-node-name \{[\s\S]{0,120}font-weight: 600/
    );
  });
  test('呼吸底用负 margin 抵消内边距，文字横向位置不随状态切换位移', () => {
    const rowRule = sliceBetween(ANIM_CSS, '.subtask-node.processing {', '}', '当前节点行规则');
    expect(rowRule).toMatch(/margin: 0 -6px/);
    expect(rowRule).toMatch(/padding: 3px 6px/);
  });
  test('reduced-motion 下退化为常亮高亮，旋转环放慢而非停止', () => {
    const reduceStart = ANIM_CSS.indexOf('@media (prefers-reduced-motion: reduce) {');
    expect(reduceStart, '动效样式块内缺少 reduced-motion 降级').toBeGreaterThan(-1);
    const reduceBlock = ANIM_CSS.slice(reduceStart);
    expect(reduceBlock).toMatch(/animation: none/);
    expect(reduceBlock).toMatch(/\.subtask-progress-active \.subtask-node-spinner \{[\s\S]{0,80}animation-duration: 2\.4s/);
    // 常亮高亮仍保留可见底色，不能退化成"什么都看不见"
    expect(reduceBlock).toMatch(/background: rgba\(var\(--brand-violet-rgb\)/);
  });
  test('新增样式只用主题 token，无硬编码色值（暗色模式自动跟随）', () => {
    expect(ANIM_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('取消链路：停止后不再假装在跑', () => {
  const CANCELLED_BODY = sliceBetween(
    CHAT_STREAMING_SRC,
    'export function finalizeCancelledStream(element) {',
    '\n}',
    'finalizeCancelledStream'
  );
  test('摘掉卡片活动态（呼吸底/旋转环随之静止）', () => {
    expect(CANCELLED_BODY).toMatch(
      /querySelectorAll\('\.subtask-progress-active'\)[\s\S]{0,80}classList\.remove\('subtask-progress-active'\)/
    );
  });
  test('状态位还原成静态 ○', () => {
    expect(CANCELLED_BODY).toMatch(/querySelectorAll\('\.subtask-node-spinner'\)[\s\S]{0,80}replaceWith\('○'\)/);
  });
});
