// completion-feedback.js - 回答完成后的声音与彩带反馈
// 成功时：音效（"叮-咚"升调）+ 彩带；失败时：仅音效（"咚-叮"降调），无彩带
// 用户主动取消不播放；两个开关独立控制声音/彩带，默认全开；尊重 prefers-reduced-motion。

import logger from '../shared/logger.js';

// 模块级节流时间戳：防止异常路径重入（500ms 内跳过重复触发）
// 成功与失败共用一个节流位：一次请求的结果二选一，不会同时触发
let _lastPlayedAt = 0;
const THROTTLE_MS = 500;

// 成功音效：三连音大三和弦璁音 C5 → E5 → G5（Do-Mi-Sol），sine 波渐强，明亮愉悦
const SUCCESS_SOUND_TONES = [
  { frequency: 523.25, startTime: 0,    duration: 0.12, type: 'sine', gain: 0.30 }, // C5
  { frequency: 659.25, startTime: 0.09, duration: 0.12, type: 'sine', gain: 0.30 }, // E5
  { frequency: 783.99, startTime: 0.18, duration: 0.22, type: 'sine', gain: 0.35 }, // G5
];

// 失败音效：降调双音 A4 → F4，square 波（方波音色“硬”有警示感），音量略低
const FAILURE_SOUND_TONES = [
  { frequency: 440.00, startTime: 0,    duration: 0.16, type: 'square', gain: 0.22 }, // A4
  { frequency: 349.23, startTime: 0.14, duration: 0.30, type: 'square', gain: 0.22 }, // F4
];

// 彩带配置
const CONFETTI_COLORS = [
  '#FF3B30', // 红
  '#FF9500', // 橙
  '#FFCC00', // 黄
  '#34C759', // 绿
  '#00C7BE', // 青
  '#007AFF', // 蓝
  '#AF52DE', // 紫
  '#FF2D55', // 粉
];
const CONFETTI_PARTICLE_COUNT = 120;   // 总粒子数（左右两炮各半）
const CONFETTI_DURATION_MS = 4000;     // 总动画时长
const CONFETTI_BURST_MS = 600;         // 喷射阶段时长
const CONFETTI_FADE_MS = 1000;         // 尾部淡出时长
const CONFETTI_GRAVITY = 0.25;         // 重力加速度 px/frame²
const CONFETTI_DRAG = 0.99;            // 空气阻力系数
const CONFETTI_TILT = 0.3;             // 礼炮相对垂直方向的内倾角（rad）
const CONFETTI_SPREAD = 0.6;           // 扇形张角（rad）
const CONFETTI_Z_INDEX = 9999;         // 高于常规 UI、低于顶级模态（10001+）

/**
 * 读取用户配置
 * @returns {Promise<{soundEnabled: boolean, confettiEnabled: boolean}>}
 */
function _readConfig() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(
        ['completionSoundEnabled', 'completionConfettiEnabled'],
        (result) => {
          // undefined 视为 true（默认开启语义）
          resolve({
            soundEnabled: result?.completionSoundEnabled !== false,
            confettiEnabled: result?.completionConfettiEnabled !== false,
          });
        }
      );
    } catch (err) {
      logger.debug('[CompletionFeedback] read config failed, use defaults:', err?.message);
      resolve({ soundEnabled: true, confettiEnabled: true });
    }
  });
}

/**
 * 播放一组音符（通用合成逻辑）
 * @param {Array<{frequency:number,startTime:number,duration:number,type?:string,gain:number}>} tones
 *   每个音符自带波形 type 与峰值音量 gain，使成功/失败能在音色维度区分
 */
function _playTones(tones) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      logger.debug('[CompletionFeedback] AudioContext unavailable');
      return;
    }
    const ctx = new AudioCtx();
    // 某些浏览器需要用户手势后才能启动 AudioContext，兜底 resume
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    let tailEnd = 0;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = tone.type || 'sine';
      osc.frequency.value = tone.frequency;
      const startAt = now + tone.startTime;
      const endAt = startAt + tone.duration;
      // 音量包络：快速淡入 -> 指数淡出，避免爆音
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(tone.gain, startAt + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(endAt + 0.02);
      if (endAt > tailEnd) tailEnd = endAt;
    }
    // 全部音符播完后关闭 AudioContext 释放资源
    const closeDelayMs = Math.max(0, (tailEnd - now) * 1000) + 200;
    setTimeout(() => {
      try { ctx.close(); } catch {}
    }, closeDelayMs);
  } catch (err) {
    logger.debug('[CompletionFeedback] play tone failed:', err?.message);
  }
}

/**
 * 播放成功音效：C5 → E5 → G5 大三和弦璁音，sine 波渐强，明亮愉悦
 * 独立 AudioContext，不复用 clarify-dialog.js 的 playNotificationSound
 */
function _playCompletionSound() {
  _playTones(SUCCESS_SOUND_TONES);
  logger.debug('[CompletionFeedback] success sound played');
}

/**
 * 播放失败音效：A4 → F4 降调，square 波，低沉警示，与成功音在音色/音符数/音高走向三重区分
 */
function _playFailureSound() {
  _playTones(FAILURE_SOUND_TONES);
  logger.debug('[CompletionFeedback] failure sound played');
}

/**
 * 判断用户是否偏好减少动效
 */
function _prefersReducedMotion() {
  try {
    return typeof window.matchMedia === 'function' &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * 从底部左右两个礼炮点扇形喷射彩带
 * 结束自动移除 canvas 并 cancelAnimationFrame，无资源泄漏
 */
function _launchConfetti() {
  try {
    if (!document.body) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width <= 0 || height <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${CONFETTI_Z_INDEX};`;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }
    ctx.scale(dpr, dpr);

    // 两个礼炮：底部左 15%（向上偏右）、右 85%（向上偏左）
    // canvas 坐标系 y 向下，角度 -PI/2 为正上方；+tilt 顺时针（右偏），-tilt 逆时针（左偏）
    const cannons = [
      { x: width * 0.15, y: height + 10, baseAngle: -Math.PI / 2 + CONFETTI_TILT },
      { x: width * 0.85, y: height + 10, baseAngle: -Math.PI / 2 - CONFETTI_TILT },
    ];

    const particles = [];
    let emitted = 0;
    let rafId = 0;
    const startTime = performance.now();

    // 按已流逝时间比例发射粒子；喷射窗口结束后一次性补齐尾部
    const emitUpTo = (elapsedMs) => {
      const capped = Math.min(elapsedMs, CONFETTI_BURST_MS);
      const target = Math.min(
        CONFETTI_PARTICLE_COUNT,
        Math.floor((capped / CONFETTI_BURST_MS) * CONFETTI_PARTICLE_COUNT)
      );
      while (emitted < target) {
        const cannon = cannons[emitted % cannons.length];
        const angle = cannon.baseAngle + (Math.random() - 0.5) * CONFETTI_SPREAD;
        const speed = 12 + Math.random() * 8; // 12-20 px/frame
        const size = 4 + Math.random() * 4;   // 4-8 px
        particles.push({
          x: cannon.x + (Math.random() - 0.5) * 20,
          y: cannon.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          shape: Math.random() < 0.5 ? 'rect' : 'circle',
        });
        emitted++;
      }
    };

    const tick = (now) => {
      const elapsed = now - startTime;
      if (elapsed >= CONFETTI_DURATION_MS) {
        cancelAnimationFrame(rafId);
        canvas.remove();
        return;
      }
      emitUpTo(elapsed);
      ctx.clearRect(0, 0, width, height);

      // 最后 CONFETTI_FADE_MS 内整体淡出
      const fadeStart = CONFETTI_DURATION_MS - CONFETTI_FADE_MS;
      const globalAlpha = elapsed > fadeStart
        ? Math.max(0, 1 - (elapsed - fadeStart) / CONFETTI_FADE_MS)
        : 1;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // 物理更新
        p.vy += CONFETTI_GRAVITY;
        p.vx *= CONFETTI_DRAG;
        p.vy *= CONFETTI_DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // 出界移除（下方或左右两侧）
        if (p.y - p.size > height || p.x + p.size < 0 || p.x - p.size > width) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = globalAlpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    logger.debug('[CompletionFeedback] confetti launched');
  } catch (err) {
    logger.debug('[CompletionFeedback] launch confetti failed:', err?.message);
  }
}

/**
 * 回答成功完成后触发反馈（成功音效 + 彩带）
 * 由 chat-manager / prompt-manager / index 三处成功路径末尾调用
 * 各自独立读取开关；失败仅 debug 日志，绝不影响主链路
 */
export async function playCompletionFeedback() {
  try {
    const now = Date.now();
    if (now - _lastPlayedAt < THROTTLE_MS) {
      logger.debug('[CompletionFeedback] throttled, skip');
      return;
    }
    _lastPlayedAt = now;

    const { soundEnabled, confettiEnabled } = await _readConfig();

    if (soundEnabled) {
      _playCompletionSound();
    }
    if (confettiEnabled && !_prefersReducedMotion()) {
      _launchConfetti();
    }
  } catch (err) {
    // 反馈失败绝不能影响主链路
    logger.debug('[CompletionFeedback] unexpected error:', err?.message || err);
  }
}

/**
 * 回答失败后触发反馈（仅失败音效，不播放彩带）
 * 由 chat-manager / prompt-manager / index 三处失败分支调用
 * 用户主动取消不属于失败，调用方需自行判断后不调用本函数
 * 与成功反馈共用 completionSoundEnabled 开关；confettiEnabled 对本函数无效
 */
export async function playFailureFeedback() {
  try {
    const now = Date.now();
    if (now - _lastPlayedAt < THROTTLE_MS) {
      logger.debug('[CompletionFeedback] throttled, skip');
      return;
    }
    _lastPlayedAt = now;

    const { soundEnabled } = await _readConfig();
    if (soundEnabled) {
      _playFailureSound();
    }
  } catch (err) {
    logger.debug('[CompletionFeedback] unexpected error:', err?.message || err);
  }
}

// 仅用于测试：重置节流时间戳，避免测试用例相互影响
export function _resetThrottleForTest() {
  _lastPlayedAt = 0;
}
