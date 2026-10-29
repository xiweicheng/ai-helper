// test/unit/asr-device-loading-guard.unit.test.js
// 「输入设备一直显示正在读取设备列表」的防回退守卫。
//
// 背景（真实用户反馈，仅 Windows 复现）：refreshDeviceList 第一件事就是
// `await navigator.mediaDevices.enumerateDevices()`，而这个调用在 Windows 上并不保证返回
// （麦克风已授权但系统音频服务刚启动 / 隐私设置半开时 Promise 永不 settle）。
// 卡住之后，下拉列表的 innerHTML、触发器的 value、状态行文案全都不会执行 ——
// 用户同时看到两个现象：状态行永远停在「正在读取设备列表…」，且下拉里只剩 HTML 写死的一项。
//
// 这些契约在 macOS 上跑不出来（枚举总是立即返回），纯 UI 也看不出差别，
// 所以用「源码规则存在性」钉住，防止后续重构把超时 / 兜底 / 防抖又拆掉。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const OPTIONS_HTML = readFileSync(
  new URL('../../options.html', import.meta.url), 'utf8',
);
const TOOLBOX_ASR_JS = readFileSync(
  new URL('../../src/options/toolbox-asr.js', import.meta.url), 'utf8',
);
const DEVICE_JS = readFileSync(
  new URL('../../src/shared/audio-input-device.js', import.meta.url), 'utf8',
);
const ZH = readFileSync(
  new URL('../../src/shared/locales/zh.js', import.meta.url), 'utf8',
);
const EN = readFileSync(
  new URL('../../src/shared/locales/en.js', import.meta.url), 'utf8',
);

/** 取顶层函数体（到第一个行首 '}' 为止；内部块都有缩进，不会误截断） */
function topLevelFn(name) {
  const re = new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`);
  const hit = TOOLBOX_ASR_JS.match(re);
  expect(hit, `缺少函数 ${name}`).not.toBeNull();
  return hit[0];
}

describe('枚举录音设备必须有超时兜底', () => {
  test('默认超时是有限正数（Infinity / 0 都等于没有超时）', () => {
    const decl = DEVICE_JS.match(/DEVICE_ENUM_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(decl, '缺少 DEVICE_ENUM_TIMEOUT_MS').not.toBeNull();
    const ms = Number(decl[1]);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10000);
  });

  test('probeAudioInputDevices 用 Promise.race 给枚举套超时', () => {
    const body = DEVICE_JS.match(/export async function probeAudioInputDevices[\s\S]*?\n}/);
    expect(body, '缺少 probeAudioInputDevices').not.toBeNull();
    expect(body[0]).toContain('Promise.race');
    expect(body[0]).toContain('TIMED_OUT');
    // 超时后必须清掉定时器，否则每次刷新都留一个悬挂 timer
    expect(body[0]).toContain('clearTimeout');
  });

  test('配置页不得再裸 await enumerateDevices（必须走带超时的 probe）', () => {
    const fn = topLevelFn('refreshDeviceList');
    expect(fn).not.toContain('listAudioInputDevices(');
    expect(fn).toContain('probeDevicesWithWarmup(');
  });
});

describe('任何分支都不允许停在 loading', () => {
  test('refreshDeviceList 有 catch 兜底，异常也落成可读文案', () => {
    const fn = topLevelFn('refreshDeviceList');
    expect(fn).toMatch(/}\s*catch\s*\(/);
    expect(fn).toContain("setDeviceNote('toolbox.asrDeviceReadFailed'");
  });

  test('超时 / 不支持 / 读失败 / 未授权 / 空列表 各有独立文案（不能只报「读取中」）', () => {
    const fn = topLevelFn('refreshDeviceList');
    ['asrDeviceTimeout', 'asrDeviceUnsupported', 'asrDeviceReadFailed',
      'asrDeviceDenied', 'asrDeviceNeedPermission', 'asrDeviceEmpty'].forEach((key) => {
      expect(fn, `缺少 ${key} 分支`).toContain(`toolbox.${key}`);
      expect(ZH, `中文缺 ${key}`).toContain(`${key}:`);
      expect(EN, `英文缺 ${key}`).toContain(`${key}:`);
    });
  });

  test('状态行不挂 data-i18n（否则任何一次 applyI18n 都会把文案冲回「正在读取」）', () => {
    const note = OPTIONS_HTML.match(/<div class="asr-device-note"[\s\S]{0,200}?<\/div>/);
    expect(note, '缺少 #asrDeviceNote').not.toBeNull();
    expect(note[0]).not.toContain('data-i18n');
    // 初始内容必须是空的：写死「正在读取设备列表…」就等于给卡死留了个默认外观
    expect(note[0]).toMatch(/hidden[^>]*>\s*<\/div>/);
  });

  test('后台刷新不反复闪回 loading（只有没拿到过结果时才显示「正在读取」）', () => {
    const fn = topLevelFn('refreshDeviceList');
    expect(fn).toMatch(/if\s*\(!deviceNoteSettled\)\s*setDeviceNote\('toolbox\.asrDeviceNoteLoading'\)/);
  });
});

describe('devicechange 刷新必须防抖', () => {
  test('连发时合并成一次刷新（否则每次 2.5s 的枚举会互相丢弃、状态行一直转）', () => {
    const fn = topLevelFn('initDeviceSection');
    expect(fn).toContain('watchAudioInputDevices(');
    expect(fn).toContain('clearTimeout(deviceWatchTimer)');
    expect(fn).toContain('DEVICE_REFRESH_DEBOUNCE_MS');
    const decl = TOOLBOX_ASR_JS.match(/DEVICE_REFRESH_DEBOUNCE_MS\s*=\s*(\d+)/);
    expect(decl, '缺少防抖常量').not.toBeNull();
    expect(Number(decl[1])).toBeGreaterThan(0);
  });
});

describe('设备块内必须有就地自救入口', () => {
  test('「授权麦克风」按钮就在设备块内（麦克风权限那节会随语音总开关收起）', () => {
    const section = OPTIONS_HTML.match(/<div class="toolbox-section" id="asrDeviceSection">[\s\S]*?\n      <\/div>/);
    expect(section, '缺少 #asrDeviceSection').not.toBeNull();
    expect(section[0]).toContain('id="asrDeviceGrantBtn"');
    expect(section[0]).toContain('id="asrDeviceRefreshBtn"');
  });

  test('超时与读失败时也露出授权入口（这两条路径同样只能靠授权打破）', () => {
    const fn = topLevelFn('refreshDeviceList');
    const timeoutBranch = fn.match(/if \(timedOut\) \{[\s\S]*?\}/);
    expect(timeoutBranch, '缺少 timedOut 分支').not.toBeNull();
    expect(timeoutBranch[0]).toContain('setDeviceGrantVisible(true)');
    expect(fn).toMatch(/catch[\s\S]*setDeviceGrantVisible\(true\)/);
  });
});

describe('预热兜底：已授权却枚举卡住时把音频服务唤醒', () => {
  test('warmup 有超时，且拿到流后一定停掉轨道（不占着麦克风）', () => {
    const body = DEVICE_JS.match(/export async function warmupAudioInputDevices[\s\S]*?\n}/);
    expect(body, '缺少 warmupAudioInputDevices').not.toBeNull();
    expect(body[0]).toContain('Promise.race');
    expect(body[0]).toContain('clearTimeout');
    expect(body[0]).toContain('track.stop()');
    // 超时后迟到的流也必须收掉，否则麦克风指示灯一直亮
    expect(body[0]).toContain('if (done) stop(got)');
  });

  test('只在已授权时预热（未授权会弹框，不能在后台偷偷弹）', () => {
    const fn = topLevelFn('probeDevicesWithWarmup');
    expect(fn).toMatch(/queryMicState\(\)\s*!==\s*'granted'/);
  });
});
