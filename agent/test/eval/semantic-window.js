// agent/test/eval/semantic-window.js - 语义地板安全窗口的标定数学（纯函数，无 IO / 无网络）
//
// 【它解决什么】SEMANTIC_QUERY_FLOOR（现值 0.48）是「查询级落点地板」：一次召回里向量
// top1 低于它就整通道不采信。这个值不是算法常数，而是**在标注样本上量出来的一段窗口**：
//   下界 = 无关查询（本库没有答案）top1 的最大值 —— 地板必须高于它，否则误报噪声；
//   上界 = 相关查询（有明确目标）top1 的最小值 —— 地板必须不高于它，否则漏掉真答案。
// 窗口 (下界, 上界] 存在时，取中点即最稳的地板。整段窗口随 embedding 模型平移，
// **换模型必须用本函数在新向量上重算**，不能沿用 0.48。
//
// 【为什么是纯函数】标定脚本（recalibrate-semantic-floor.mjs）负责联网取向量，本文件只
// 负责数学。数学能被已提交的黄金向量离线测试钉住，脚本才不是「交付一个没验证过的结论」。
//
// 【标注约定】与 memory-recall-fixtures.js 的 SEMANTIC_CASES 对齐：
//   有 target 的查询 = 相关样本（参与上界）；有 expectNone 的查询 = 无关样本（参与下界）；
//   两者都没有的（如只有 expectAbsent 的「子串误伤」用例）与地板标定无关，忽略。

import { cosine } from '../../src/memory/vectors.js';

const DEFAULT_GRID = 0.01;   // 与 Task 2 网格搜索同尺：地板只在这个精度上有意义
const MIN_CONTROLS = 3;      // 无关样本低于此数即告警（下界靠它们撑，样本薄则窗口不可信）

/** 一条查询对整库的最高余弦 [top1, top1Id] */
function top1Of(qv, docs) {
  let top1 = -Infinity;
  let top1Id = null;
  for (const id of Object.keys(docs)) {
    const c = cosine(qv, docs[id]);
    if (c > top1) { top1 = c; top1Id = id; }
  }
  return [top1, top1Id];
}

/** 归整到栅格并消掉浮点尾噪：0.47425 → 0.47 */
function snapToGrid(v, grid) {
  return Number((Math.round(v / grid) * grid).toFixed(6));
}

/**
 * 在给定向量与标注上量语义地板的安全窗口。
 * @param {{
 *   docs: Record<string, number[]>,
 *   queries: Record<string, number[]>,
 *   cases: Array<{query:string, target?:string, expectNone?:boolean}>,
 *   currentFloor?: number,
 *   gridStep?: number
 * }} input
 * @returns {{
 *   relevant: Array<{query,target,top1,top1Id,targetIsTop1}>,
 *   control: Array<{query,top1,top1Id}>,
 *   skipped: string[],
 *   controlTopMax: number|null, relevantTopMin: number|null,
 *   lower: number|null, upper: number|null, windowUsable: boolean,
 *   recommend: number|null,
 *   currentInside: boolean, marginBelow: number|null, marginAbove: number|null,
 *   warnings: string[]
 * }}
 */
export function computeSemanticWindow({ docs = {}, queries = {}, cases = [], currentFloor, gridStep = DEFAULT_GRID } = {}) {
  const relevant = [];
  const control = [];
  const skipped = [];

  for (const c of cases) {
    const qv = queries[c.query];
    if (!qv) { skipped.push(c.query); continue; }
    const [top1, top1Id] = top1Of(qv, docs);
    if (c.expectNone) {
      control.push({ query: c.query, top1, top1Id });
    } else if (c.target) {
      relevant.push({ query: c.query, target: c.target, top1, top1Id, targetIsTop1: top1Id === c.target });
    }
    // 既无 target 又无 expectNone：与地板标定无关，不计入
  }

  const controlTopMax = control.length ? Math.max(...control.map(r => r.top1)) : null;
  const relevantTopMin = relevant.length ? Math.min(...relevant.map(r => r.top1)) : null;
  const lower = controlTopMax;
  const upper = relevantTopMin;
  const windowUsable = lower !== null && upper !== null && lower < upper;

  // 推荐值：窗口中点归整到栅格；但归整后的值必须仍落在 (下界, 上界] 内——窗口窄于栅格时
  // 四舍五入可能越出上界（地板高于上界会拒掉最低分的相关查询），此时退回未归整中点
  // （窗口可用时中点必然严格落在窗口内）。
  let recommend = null;
  let recommendSnapped = false;
  if (windowUsable) {
    const mid = (lower + upper) / 2;
    const snapped = snapToGrid(mid, gridStep);
    if (snapped > lower && snapped <= upper) {
      recommend = snapped;
      recommendSnapped = true;
    } else {
      recommend = Number(mid.toFixed(6));
    }
  }

  const hasCurrent = Number.isFinite(currentFloor);
  const currentInside = hasCurrent && windowUsable && currentFloor > lower && currentFloor <= upper;
  const marginBelow = hasCurrent && lower !== null ? currentFloor - lower : null;
  const marginAbove = hasCurrent && upper !== null ? upper - currentFloor : null;

  const warnings = [];
  if (control.length < MIN_CONTROLS) {
    warnings.push(`无关查询样本 ${control.length} 条（< ${MIN_CONTROLS}），下界 ${lower === null ? '缺失' : lower.toFixed(4)} 撑不住，换模型时建议补更多本库确实无答案的查询`);
  }
  if (!windowUsable) {
    warnings.push('安全窗口为空（下界 ≥ 上界或缺失）：该地板取值不可用，需补标注或该模型对相关/无关查询区分度不足');
  }
  if (windowUsable && (upper - lower) < gridStep * 2) {
    warnings.push(`安全窗口过窄（宽度 ${(upper - lower).toFixed(4)} < 2×${gridStep}）：推荐值仅供人工复核，换模型时建议补标注扩窗`);
  }
  if (windowUsable && !recommendSnapped) {
    warnings.push(`推荐值 ${recommend} 未落在 ${gridStep} 栅格上（窗口窄于栅格，归整会越界）：已退回窗口中点`);
  }
  const offTop1 = relevant.filter(r => !r.targetIsTop1);
  if (offTop1.length) {
    warnings.push(`相关查询有 ${offTop1.length} 条目标未排在 top1（召回质量下降信号）：${offTop1.map(r => r.query).join('、')}`);
  }
  if (skipped.length) {
    warnings.push(`以下查询缺向量被跳过（重跑生成器后复查）：${skipped.join('、')}`);
  }

  return {
    relevant, control, skipped,
    controlTopMax, relevantTopMin, lower, upper, windowUsable,
    recommend, currentInside, marginBelow, marginAbove, warnings
  };
}
