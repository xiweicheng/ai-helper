/**
 * SW 任务级保活心跳（方案 A）。
 *
 * 背景：MV3 Service Worker 约 30 秒无事件即被 Chrome 终止。ReAct 长任务执行期
 * 存在"静默间隙"——等首 token 的漫长思考期、澄清/确认弹窗等待用户、单次超长
 * fetch——期间可能没有任何扩展 API 调用，而"panel port 连接算不算活跃"在不同
 * Chrome 版本上语义松紧不一，仅靠 keepalive port 硬扛不可靠。
 *
 * 方案：任务执行期间每 20s 主动调用一次轻量扩展 API（chrome.runtime.getPlatformInfo）
 * 重置闲置计时器。这是 Chrome 官方博客针对长时间任务给出的标准 heartbeat/waitUntil
 * 模式；只在任务执行窗口内开启，结束即停，非常态违规。
 *
 * 引用计数：plan 子任务与 dispatch 子代理各自嵌套调用 reactLoop，每层 start/stop
 * 成对出现，只有最外层 stop 才真正停跳。心跳模块作为叶子模块不依赖任何业务模块，
 * 规避 react-loop ↔ dispatcher 循环依赖（沿用 subagent-depth.js 的分层约定）。
 */

/** 心跳间隔：必须显著小于 30s 闲置阈值并留余量（官方示例取 20~25s） */
export const SW_HEARTBEAT_INTERVAL_MS = 20 * 1000;

let refCount = 0;
let intervalId = null;

/**
 * 跳一拍：调用最轻量的扩展 API。任何异常静默吞掉（如重载竞态下
 * chrome API 被剥离抛 TypeError），保证定时器不被单次失败打断。
 */
function pulse() {
  try {
    chrome.runtime.getPlatformInfo(() => {
      // 回调内读取 lastError 以消费错误，避免 "Unchecked runtime.lastError" 噪声
      void chrome.runtime.lastError;
    });
  } catch (e) {
    // 静默降级：下一拍继续尝试
  }
}

/** 任务开始：引用计数 +1，首拍立即执行并建立周期定时器 */
export function startSwHeartbeat() {
  refCount++;
  if (intervalId !== null) return;
  pulse();
  intervalId = setInterval(pulse, SW_HEARTBEAT_INTERVAL_MS);
}

/** 任务结束：引用计数 -1，归零才真正清除定时器；多余调用安全（计数不出负数） */
export function stopSwHeartbeat() {
  if (refCount > 0) refCount--;
  if (refCount === 0 && intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/** 当前是否在跳（供调试与测试断言） */
export function isSwHeartbeatRunning() {
  return intervalId !== null;
}

/** 测试专用：完全复位模块状态 */
export function __resetSwHeartbeat() {
  refCount = 0;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
