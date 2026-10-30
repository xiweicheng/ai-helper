// side_panel/todo-stats-view.js - 统计浮层的纯渲染（不碰 DOM）
//
// 只吃 summarizeStats 的结果，吐出一段 HTML：完成率 / 四态 / 逾期 / 近 7 天柱状 / 今日与连续。
// 与 DOM 解耦后，数字口径与柱高归一化都能直接单测。

import { t, registerTranslations, getLanguage } from '../shared/i18n.js';

registerTranslations('zh', {
  todoStats: {
    title: '待办统计',
    close: '关闭',
    rate: '完成率',
    doneOf: '已完成 {done} / {total}',
    pending: '待处理',
    doing: '处理中',
    done: '已完成',
    overdue: '逾期',
    high: '高优先级',
    week: '近 7 天完成',
    dayTitle: '{date}：完成 {done} · 新增 {added}',
    todayAdded: '今日新增 {n}',
    todayDone: '今日完成 {n}',
    streak: '连续完成 {n} 天',
    highCount: '高优先级 {n}',
    empty: '还没有待办，加一条就能看到趋势',
  },
});

registerTranslations('en', {
  todoStats: {
    title: 'Todo stats',
    close: 'Close',
    rate: 'Completion',
    doneOf: '{done} of {total} done',
    pending: 'Pending',
    doing: 'In progress',
    done: 'Done',
    overdue: 'Overdue',
    high: 'High priority',
    week: 'Done in last 7 days',
    dayTitle: '{date}: {done} done · {added} added',
    todayAdded: '{n} added today',
    todayDone: '{n} done today',
    streak: '{n}-day streak',
    highCount: '{n} high priority',
    empty: 'No todos yet — add one to see the trend',
  },
});

const WEEKDAYS = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/** 柱图高度下限：有完成的当天至少露出一小截，否则 1 条和 0 条看起来一样 */
const MIN_BAR_HEIGHT = 6;

function parseDay(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dayLabel(dateStr) {
  const date = parseDay(dateStr);
  if (!date) return String(dateStr || '');
  if (getLanguage() === 'en') return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekdayLabel(dateStr) {
  const date = parseDay(dateStr);
  if (!date) return '';
  const names = WEEKDAYS[getLanguage()] || WEEKDAYS.zh;
  return names[date.getDay()];
}

function tile(value, label, tone) {
  return `<div class="todo-stats-tile${tone ? ` ${tone}` : ''}">
        <span class="todo-stats-tile-value">${value}</span>
        <span class="todo-stats-tile-label">${label}</span>
      </div>`;
}

function weekBars(week) {
  const max = week.reduce((acc, day) => Math.max(acc, day.done || 0), 0);
  const cols = week.map((day) => {
    const done = day.done || 0;
    const height = done === 0
      ? 0
      : Math.max(MIN_BAR_HEIGHT, Math.round((done / max) * 100));
    return `<div class="todo-stats-bar-col" title="${t('todoStats.dayTitle', {
      date: dayLabel(day.date), done, added: day.added || 0,
    })}">
          <span class="todo-stats-bar" style="height:${height}%"></span>
          <span class="todo-stats-bar-label">${weekdayLabel(day.date)}</span>
        </div>`;
  });
  return `<div class="todo-stats-week">${cols.join('')}</div>`;
}

/**
 * 统计浮层内容
 * @param {{total:number,done:number,doing:number,pending:number,overdue:number,high:number,doneRate:number,today:{added:number,done:number},week:Array<{date:string,added:number,done:number}>,streak:number}} stats
 * @returns {string}
 */
export function buildStatsHtml(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const total = Number(s.total) || 0;

  if (total === 0) {
    return `<div class="todo-stats-empty">${t('todoStats.empty')}</div>`;
  }

  const rate = Math.min(100, Math.max(0, Number(s.doneRate) || 0));
  const today = s.today || { added: 0, done: 0 };
  const week = Array.isArray(s.week) ? s.week : [];

  return `<div class="todo-stats-hero">
      <div class="todo-stats-rate">
        <span class="todo-stats-rate-value">${rate}%</span>
        <span class="todo-stats-rate-label">${t('todoStats.rate')}</span>
      </div>
      <div class="todo-stats-hero-meta">${t('todoStats.doneOf', { done: s.done || 0, total })}</div>
      <div class="todo-stats-track"><i style="width:${rate}%"></i></div>
    </div>
    <div class="todo-stats-tiles">
      ${tile(s.pending || 0, t('todoStats.pending'))}
      ${tile(s.doing || 0, t('todoStats.doing'), 'doing')}
      ${tile(s.done || 0, t('todoStats.done'), 'done')}
      ${tile(s.overdue || 0, t('todoStats.overdue'), s.overdue ? 'alert' : '')}
    </div>
    <div class="todo-stats-section">
      <div class="todo-stats-section-title">${t('todoStats.week')}</div>
      ${weekBars(week)}
    </div>
    <div class="todo-stats-facts">
      <span>${t('todoStats.todayAdded', { n: today.added || 0 })}</span>
      <span>${t('todoStats.todayDone', { n: today.done || 0 })}</span>
      <span>${t('todoStats.streak', { n: s.streak || 0 })}</span>
      <span>${t('todoStats.highCount', { n: s.high || 0 })}</span>
    </div>`;
}
