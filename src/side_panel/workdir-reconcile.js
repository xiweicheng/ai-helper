// workdir-reconcile.js - 修复「扩展端会话记录 ↔ 代理端注册表」的目录漂移
//
// 背景（真实故障）：侧边栏启动时没有把会话记录的 workdir 恢复进内存态，
// 次保存就把库里的绑定写成 null。结果扩展端按默认目录解析，而代理端
// session-workdirs.json 里还留着这条会话的旧绑定 ——
// chip 显示「默认」并误报「目录不存在或不可访问」，更危险的是命令可能仍跑在旧目录。
//
// 修好水合之后不会再产生新的漂移，但已经漂移的历史数据需要一次性修复：
//   - 扩展端没有绑定（记录被抹过）→ 以代理端为准恢复绑定（代理端能返回该目录，
//     说明目录在这台机器上确实存在，且这正是用户当初选的目录）
//   - 扩展端有绑定但属于别的代理（换代理回落）→ 清掉代理端残留，让两边都按默认目录
import logger from '../shared/logger.js';
import {
  getBaseSessionId,
  getProxyAgentConfig,
  resolveWorkdirForSession,
  unbindSessionWorkdirRemote,
} from '../shared/workdir-scope.js';
import { setSessionWorkdirBinding } from '../storage/session-store.js';

/** 每个会话只尝试修复一次（避免频繁打代理端 / 反复弹提示） */
const attempted = new Set();
/** 正在修复中的会话，防止并发重复请求 */
const inFlight = new Set();

/**
 * 修复某会话的目录漂移（幂等：同一会话只尝试一次）
 * @param {string|null} sessionId
 * @returns {Promise<{ adopted?: boolean, cleaned?: boolean, workdir?: string }|null>}
 *   adopted=已按代理端恢复绑定；cleaned=已清掉代理端残留；null=无需/无法修复
 */
export async function reconcileSessionWorkdir(sessionId) {
  const base = getBaseSessionId(sessionId) || sessionId;
  if (!base || attempted.has(base) || inFlight.has(base)) return null;
  inFlight.add(base);
  try {
    const cfg = await getProxyAgentConfig();
    if (!cfg) return null;

    let data = null;
    try {
      const resp = await fetch(`${cfg.url}/api/status/detail`, {
        headers: { Authorization: `Bearer ${cfg.token}`, 'X-AIH-Session-Id': base },
      });
      if (!resp.ok) return null;
      data = await resp.json();
    } catch (err) {
      logger.debug('[WorkdirReconcile] fetch detail failed:', err?.message || err);
      return null;
    }
    if (!data?.success || !data.sessionWorkdirSupported) return null;

    // 代理端注册表里这条会话的绑定（原始值，不带回落）
    const registered = data.sessionWorkdir || null;
    const agentDefault = data.defaultWorkdir || data.workdir || null;
    if (!registered || registered === agentDefault) return null;

    // 扩展端已经按「本会话」解析成功 → 两侧一致，无需修复
    const resolved = await resolveWorkdirForSession(base);
    if (resolved.scope === 'session') return null;

    attempted.add(base);

    if (!resolved.boundWorkdir) {
      // 记录被抹过（历史 bug）：按代理端恢复绑定
      const ok = await setSessionWorkdirBinding(base, registered, resolved.agentId || cfg.id || null);
      if (!ok) return null;
      logger.debug('[WorkdirReconcile] restored session workdir:', base, registered);
      return { adopted: true, workdir: registered };
    }

    // 有绑定但生效代理不同（换代理回落）：代理端残留会让命令跑在旧目录，清掉
    await unbindSessionWorkdirRemote(base);
    logger.debug('[WorkdirReconcile] cleared stale agent binding:', base, registered);
    return { cleaned: true, workdir: registered };
  } finally {
    inFlight.delete(base);
  }
}

/** 测试/代理切换时清空记忆（避免旧的「已尝试」挡住新一轮修复） */
export function resetWorkdirReconcileState() {
  attempted.clear();
  inFlight.clear();
}
