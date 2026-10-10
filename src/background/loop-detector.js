// loop-detector.js - 多模式循环检测器（纯逻辑，browser-free）
// 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
//
// 六模式：①重复（窗口制）②ref 枚举 ③ABAB 振荡 ④失败作用域 ⑤导航重置 ⑥无进展滚动
// 接口：createLoopDetector().record(tabId, toolName, args, result)
//   → { kind: 'none' }                        无检测（含"持续片段内静默"）
//   → { kind: 'nudge', warning }              模型可见英文提醒（用户不可见）；多条目以 \n 连接
//   → { kind: 'stop', reason, params }        硬停；react-loop 侧映射 t('reactLoop.loopStopped*')
// 本模块不依赖任何浏览器 API，可在 Node 环境直接单测。

export const LOOP_DETECTOR_CONFIG = {
  windowSize: 6,            // 重复检测环形窗口
  ababTailSize: 8,          // ABAB 交替尾迹
  repeat: { nudgeAt: 3, stopAt: 8, maxKeys: 32 },
  oscillation: { nudgeTail: 4, stopTail: 8 },
  refEnum: { nudgeAt: 3, stopSuspicious: 6, stopNonSeq: 12, maxScopes: 8 },
  failureScope: { nudgeAt: 2, stopAt: 3, maxScopes: 32 },
  noProgressScroll: { nudgeAt: 2, stopAt: 3, coordGrid: 5 },
  hysteresis: { healthyToRearm: 2 },
  budget: { stopAtNudges: 8 },
};

// 失败作用域适用的变更类工具白名单
const FAILURE_SCOPE_TOOLS = new Set([
  'interact_element', 'fill_form', 'select_dropdown',
  'keyboard_input', 'file_upload', 'drag_drop',
]);

// —— 稳定序列化 + FNV-1a 哈希（约 24K 字符串 <1ms）——

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashValue(value) {
  try { return fnv1a(stableStringify(value)); } catch { return fnv1a(String(value)); }
}

// —— 各模式的身份计算 ——

// 动作身份：工具名 + 参数（不含结果）→ ABAB 振荡用
function argsKeyOf(toolName, args) {
  return hashValue({ n: toolName, a: args });
}

// 完整身份：工具名 + 参数 + 结果（结果进 key 是刻意保留：轮询合法不误报）→ 重复检测用
function fullKeyOf(toolName, args, result) {
  return hashValue({ n: toolName, a: args, r: result });
}

// ref 枚举作用域：仅取影响分页语义的四个参数（默认值归一）；不含 page
function refScopeOf(args) {
  return hashValue({
    maxResults: args.maxResults ?? 100,
    maxChars: args.maxChars ?? 6000,
    filterByText: args.filterByText ?? '',
    frames: args.frames ?? 'auto',
  });
}

// 失败作用域归一：按目标而非调用形态（同一 ref 的 click/type 视为同目标）
function failureScopeOf(toolName, args) {
  switch (toolName) {
    case 'interact_element':
      if (args.ref != null) return `ref:${args.ref}`;
      if (args.text != null) return `text:${String(args.text).trim().replace(/\s+/g, ' ')}`;
      if (args.selector) return `sel:${args.selector}`;
      return null;
    case 'fill_form': {
      const fields = Array.isArray(args.fields) ? args.fields : [];
      const ids = fields.map(f =>
        f && f.ref != null ? `ref:${f.ref}` : `sel:${f?.selector ?? ''}:${f?.fieldType ?? ''}`
      ).sort();
      return ids.length ? `ff:${ids.join(',')}` : null;
    }
    case 'select_dropdown':
      if (args.ref != null) return `sd:ref:${args.ref}`;
      if (args.triggerSelector || args.selector) return `sd:sel:${args.triggerSelector || args.selector}`;
      return null;
    case 'keyboard_input':
      return args.selector ? `kb:${args.selector}` : null;
    case 'file_upload':
      if (args.ref != null) return `fu:ref:${args.ref}`;
      if (args.selector) return `fu:sel:${args.selector}`;
      return null;
    case 'drag_drop':
      if (args.sourceSelector && args.targetSelector) return `dd:sel:${args.sourceSelector}->${args.targetSelector}`;
      if (args.sourceRef != null && args.targetRef != null) return `dd:ref:${args.sourceRef}->${args.targetRef}`;
      return null;
    default:
      return null;
  }
}

// 失败判定：declined 明确计失败；success===false 或 error 非空计失败
function isFailedResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.declined === true) return true;
  if (result.success === false) return true;
  if (result.error) return true;
  return false;
}

// 导航重置信号：back/forward/reload 成功、wait_navigation 成功（= 进展证据）
// 真实工具契约：manage_tab action∈['open','switch','close','reload','navigate']，
// history back/forward 为 action:'navigate' + direction:'back'|'forward'（见 tools/tab-tools.js）
function isNavResetSignal(toolName, args, result) {
  if (!result || result.success === false) return false;
  if (toolName === 'wait_navigation') return true;
  if (toolName === 'manage_tab') {
    if (args?.action === 'reload') return true;
    if (args?.action === 'navigate' && ['back', 'forward'].includes(args?.direction)) return true;
  }
  return false;
}

// 无进展滚动的作用域 key（selector/text 目标返回 null = 不参与）
function scrollKeyOf(args, coordGrid) {
  if (!args) return null;
  if (args.target === 'top') return 'top';
  if (args.target === 'bottom') return 'bottom';
  if (args.target === 'coordinates') {
    const gx = Math.round((Number(args.x) || 0) / coordGrid) * coordGrid;
    const gy = Math.round((Number(args.y) || 0) / coordGrid) * coordGrid;
    return `coords:${gx},${gy}`;
  }
  return null;
}

// —— 桶与子状态 ——

function freshRefEnumState() {
  return { lastScope: null, lastPage: null, lastHasMore: false, seenByScope: new Map(), suspicious: 0, nonSeq: 0 };
}

function createBucket() {
  return {
    window: [],            // [{ argsKey, fullKey, name }] 最近 windowSize 条（重复检测）
    ababTail: [],          // [{ key, name }] 最近 ababTailSize 条（振荡检测）
    repeatCounts: new Map(),
    refEnum: freshRefEnumState(),
    failureScopes: new Map(),
    scroll: { key: null, count: 0 },
    warned: new Set(),     // 页面作用域提醒标记（导航重置清）
    flowWarned: new Set(), // ABAB 专用提醒标记（导航不清）
    healthyStreak: 0,      // 连续健康调用数（迟滞重武装）
  };
}

function trimMap(map, max) {
  while (map.size > max) map.delete(map.keys().next().value);
}

function mergeConfig(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override || {})) {
    out[k] = (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      ? { ...base[k], ...override[k] }
      : override[k];
  }
  return out;
}

// —— 模式算法 ——

// ABAB 振荡：最近 4 条 A,B,A,B → hit；尾迹全交替 → fullAlternate（硬停）
function evalAbab(bucket, cfg) {
  const tail = bucket.ababTail;
  const out = { hit: false, fullAlternate: false, pairKey: null, nameA: null, nameB: null };
  const n = cfg.oscillation.nudgeTail;
  const last = tail.slice(-n);
  if (last.length === n) {
    const odd = last[0];
    const even = last[1];
    let alt = !!even && odd.key !== even.key;
    if (alt) {
      for (let i = 0; i < last.length; i++) {
        const expected = i % 2 === 0 ? odd : even;
        if (last[i].key !== expected.key) { alt = false; break; }
      }
    }
    if (alt) {
      out.hit = true;
      out.pairKey = [odd.key, even.key].sort().join('|');
      out.nameA = odd.name;
      out.nameB = even.name;
    }
  }
  const st = cfg.oscillation.stopTail;
  if (tail.length >= st) {
    const w = tail.slice(-st);
    const odd = w[0];
    const even = w[1];
    let full = odd.key !== even.key;
    if (full) {
      for (let i = 0; i < w.length; i++) {
        const expected = i % 2 === 0 ? odd : even;
        if (w[i].key !== expected.key) { full = false; break; }
      }
    }
    if (full) {
      out.fullAlternate = true;
      out.pairKey = [odd.key, even.key].sort().join('|');
      out.nameA = odd.name;
      out.nameB = even.name;
    }
  }
  return out;
}

// ref 枚举更新：返回本次是否计可疑（suspicious / nonSeq 归类见 spec §5.2）
function updateRefEnum(bucket, args, result, cfg) {
  const st = bucket.refEnum;
  const scope = refScopeOf(args);
  const page = Number.isInteger(args.page) && args.page > 0 ? args.page : 1;
  const totalPages = typeof result.totalPages === 'number' ? result.totalPages : null;
  const hasMore = result.hasMore === true;
  const resultHash = hashValue(result);
  let hit = false;

  let seen = st.seenByScope.get(scope);
  if (!seen) {
    seen = new Map();
    st.seenByScope.set(scope, seen);
    trimMap(st.seenByScope, cfg.refEnum.maxScopes);
  }

  const prevHash = seen.get(page);
  const isSequential = st.lastScope === scope && page === (st.lastPage ?? 0) + 1 && st.lastHasMore === true;
  const isIllegalPage = totalPages !== null && page > totalPages;

  if (isIllegalPage) {
    st.suspicious += 1; // 非法页（超出 totalPages）
    hit = true;
  } else if (isSequential) {
    // 合法顺序步进：不增可疑
  } else if (prevHash !== undefined && prevHash === resultHash) {
    st.suspicious += 1; // 重读且结果未变化
    hit = true;
  } else if (prevHash !== undefined) {
    // 重读但结果有变化（轮询合法）→ 视为推进
  } else if (seen.size === 0) {
    // 新作用域首页 → 中性（连续多搜索不误报）
  } else {
    st.nonSeq += 1; // 非顺序新页（乱序跳页）
    hit = true;
  }

  seen.set(page, resultHash);
  st.lastScope = scope;
  st.lastPage = page;
  st.lastHasMore = hasMore;
  return hit;
}

// —— 检测器实例 ——

export function createLoopDetector(config = {}) {
  const cfg = mergeConfig(LOOP_DETECTOR_CONFIG, config);
  const buckets = new Map();
  let nudges = 0; // 全局提醒预算（实例级，不按 tab；永不清零）

  function getBucket(tabId) {
    let b = buckets.get(tabId);
    if (!b) { b = createBucket(); buckets.set(tabId, b); }
    return b;
  }

  function rearmIfHealthy(bucket) {
    bucket.healthyStreak += 1;
    if (bucket.healthyStreak >= cfg.hysteresis.healthyToRearm) {
      bucket.warned.clear();
      bucket.flowWarned.clear();
      bucket.healthyStreak = 0;
    }
  }

  // 同片段仅 1 条；flow=true 用 ABAB 专用集合（导航不清）
  function maybeNudge(bucket, warnKey, text, out, flow = false) {
    const set = flow ? bucket.flowWarned : bucket.warned;
    if (set.has(warnKey)) return false;
    set.add(warnKey);
    out.push(text);
    return true;
  }

  function resetPageScopedState(bucket) {
    bucket.repeatCounts.clear();
    bucket.refEnum = freshRefEnumState();
    bucket.failureScopes.clear();
    bucket.scroll = { key: null, count: 0 };
    bucket.warned.clear();
    // window / ababTail / flowWarned / healthyStreak / nudges 保留
  }

  function record(tabId, toolName, args, result) {
    const bucket = getBucket(tabId);
    const safeArgs = args || {};
    const isNav = isNavResetSignal(toolName, safeArgs, result);
    if (isNav) resetPageScopedState(bucket);

    const aKey = argsKeyOf(toolName, safeArgs);
    const fKey = fullKeyOf(toolName, safeArgs, result);
    const skipped = !!(result && result.skipped);

    let stop = null;
    const warnings = [];
    let patternHit = false;

    // ① 入窗 + ② 入尾迹（成功导航不入窗：其本身即进展证据；尾迹保留供导航乒乓检测）
    if (!isNav) bucket.window.push({ argsKey: aKey, fullKey: fKey, name: toolName });
    if (bucket.window.length > cfg.windowSize) bucket.window.shift();
    bucket.ababTail.push({ key: aKey, name: toolName });
    if (bucket.ababTail.length > cfg.ababTailSize) bucket.ababTail.shift();

    if (!isNav) {
      // ③ 重复：窗口制软提醒 + 累计硬停（轮询因结果进 key 天然不触发）
      const count = (bucket.repeatCounts.get(fKey) || 0) + 1;
      bucket.repeatCounts.set(fKey, count);
      trimMap(bucket.repeatCounts, cfg.repeat.maxKeys);
      const inWindow = bucket.window.filter(e => e.fullKey === fKey).length;
      if (count >= cfg.repeat.stopAt) {
        stop = stop || { reason: 'repeat', params: { count, toolName } };
        patternHit = true;
      } else if (inWindow >= cfg.repeat.nudgeAt) {
        patternHit = true;
        maybeNudge(bucket, `repeat:${fKey}`,
          `Repeated identical tool call detected: "${toolName}" ×${count} with identical parameters and identical results in the recent window; this operation is making no progress.`,
          warnings);
      }

      // ⑤ ref 枚举（query_elements 专用；失败读不更新；skipped 不计入）
      if (toolName === 'query_elements') {
        if (!skipped && !(result && result.success === false)) {
          if (updateRefEnum(bucket, safeArgs, result, cfg)) patternHit = true;
          const st = bucket.refEnum;
          if (st.suspicious >= cfg.refEnum.stopSuspicious || st.nonSeq >= cfg.refEnum.stopNonSeq) {
            stop = stop || { reason: 'refEnum', params: { count: Math.max(st.suspicious, st.nonSeq) } };
            patternHit = true;
          } else if (st.suspicious >= cfg.refEnum.nudgeAt) {
            patternHit = true;
            maybeNudge(bucket, 'refEnum',
              `Element enumeration loop detected: pages are being re-read with unchanged results (${st.suspicious} suspicious reads so far).`,
              warnings);
          }
        }
      } else if (!skipped) {
        // 非 query 的已执行调用 = 进展证据 → 枚举状态整体清零
        bucket.refEnum = freshRefEnumState();
      }

      // ⑥ 失败作用域（白名单工具；同目标一次成功即退休）
      if (!skipped && FAILURE_SCOPE_TOOLS.has(toolName)) {
        const scope = failureScopeOf(toolName, safeArgs);
        if (scope) {
          if (isFailedResult(result)) {
            const c = (bucket.failureScopes.get(scope) || 0) + 1;
            bucket.failureScopes.set(scope, c);
            trimMap(bucket.failureScopes, cfg.failureScope.maxScopes);
            if (c >= cfg.failureScope.stopAt) {
              stop = stop || { reason: 'failureScope', params: { scope } };
              patternHit = true;
            } else if (c >= cfg.failureScope.nudgeAt) {
              patternHit = true;
              maybeNudge(bucket, `failure:${scope}`,
                `Repeated failure detected: the operation target "${scope}" has failed ${c} times; this target is making no progress.`,
                warnings);
            }
          } else {
            bucket.failureScopes.delete(scope);
          }
        }
      }

      // ⑦ 无进展滚动（静态判定 moved:false；成功滚动即清零）
      if (!skipped && toolName === 'scroll_to') {
        const sKey = scrollKeyOf(safeArgs, cfg.noProgressScroll.coordGrid);
        const notMoved = result && result.moved === false;
        if (sKey && notMoved) {
          if (bucket.scroll.key !== sKey) { bucket.scroll.key = sKey; bucket.scroll.count = 0; }
          bucket.scroll.count += 1;
          if (bucket.scroll.count >= cfg.noProgressScroll.stopAt) {
            stop = stop || { reason: 'noProgressScroll', params: { key: sKey } };
            patternHit = true;
          } else if (bucket.scroll.count >= cfg.noProgressScroll.nudgeAt) {
            patternHit = true;
            maybeNudge(bucket, `scroll:${sKey}`,
              `No-progress scrolling detected: scroll_to(${sKey}) reports no movement (already at boundary) ${bucket.scroll.count} times.`,
              warnings);
          }
        } else if (!notMoved && !(result && result.success === false)) {
          bucket.scroll = { key: null, count: 0 };
        }
      }
    }

    // ④ ABAB 振荡（导航与非导航调用均参与：back/forward 交替即导航乒乓）
    const abab = evalAbab(bucket, cfg);
    if (abab.fullAlternate) {
      stop = stop || { reason: 'oscillation', params: { keyA: abab.nameA, keyB: abab.nameB } };
      patternHit = true;
    } else if (abab.hit) {
      patternHit = true;
      maybeNudge(bucket, `abab:${abab.pairKey}`,
        `Oscillation detected: "${abab.nameA}" and "${abab.nameB}" are alternating repeatedly with no progress.`,
        warnings, true);
    }

    // ⑧ 健康迟滞 / 重武装
    if (patternHit) {
      bucket.healthyStreak = 0;
    } else {
      rearmIfHealthy(bucket);
    }

    if (stop) return { kind: 'stop', ...stop };

    if (warnings.length > 0) {
      nudges += 1;
      if (nudges >= cfg.budget.stopAtNudges) {
        return { kind: 'stop', reason: 'budget', params: { nudges } };
      }
      return { kind: 'nudge', warning: warnings.join('\n') };
    }
    return { kind: 'none' };
  }

  return { record };
}
