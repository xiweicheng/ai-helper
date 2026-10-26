// @vitest-environment jsdom
// buildUserContent 参数化：显式传入图片数组时只拼"那一批"（发送批次快照），
// 不传时才回落 state.attachedImages（保持旧行为）。
// 发送管线依赖这个参数：消费点执行后 state 可能已被清空、或混入了用户新挂的图片，
// 只有快照才能保证"这条消息只带自己那一刻的图片"。
import { describe, test, expect, beforeEach } from 'vitest';

import state from '../../src/side_panel/state.js';
import { buildUserContent } from '../../src/side_panel/image-preview.js';

const IMG_A = { originalUrl: 'data:image/png;base64,AAA', compressedUrl: 'data:image/png;base64,AA', width: 8, height: 8 };
const IMG_B = { originalUrl: 'data:image/png;base64,BBB', compressedUrl: 'data:image/png;base64,BB', width: 16, height: 16 };

beforeEach(() => {
  state.enableImageInput = true;
  state.attachedImages = [];
});

describe('buildUserContent 参数化（发送批次快照）', () => {
  test('显式传入快照：只拼快照里的那批，state 里新挂的图片绝不串入', () => {
    state.attachedImages = [{ ...IMG_B }]; // 发送期间用户新挂的（属于下一条消息）
    const content = buildUserContent('正文', [{ ...IMG_A }]);

    expect(Array.isArray(content)).toBe(true);
    const imageParts = content.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0].image_url.url).toBe(IMG_A.compressedUrl);
    expect(imageParts[0].image_url.original_url).toBe(IMG_A.originalUrl);
  });

  test('显式传入空数组：只发文字，即使 state 此刻挂着图片', () => {
    state.attachedImages = [{ ...IMG_B }];
    expect(buildUserContent('正文', [])).toBe('正文');
  });

  test('不传快照：回落 state.attachedImages（旧行为不变）', () => {
    state.attachedImages = [{ ...IMG_A }];
    const content = buildUserContent('正文');

    expect(Array.isArray(content)).toBe(true);
    expect(content[1].type).toBe('image_url');
    expect(content[1].image_url.url).toBe(IMG_A.compressedUrl);
  });

  test('图片功能关闭：无论快照还是 state 都只发文字', () => {
    state.attachedImages = [{ ...IMG_A }];
    state.enableImageInput = false;
    expect(buildUserContent('正文', [{ ...IMG_A }])).toBe('正文');
  });
});