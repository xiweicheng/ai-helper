// background/detach-window.js - 脱离窗口（独立弹窗）状态恢复
//
// SW 启动时需要从 storage 恢复脱离窗口的 windowId（供插件图标点击、窗口关闭
// 清理等路径同步判断）。storage / windows 调用在扩展重载、SW 终止等瞬间可能
// 失败（lastError='No SW' 时回调 result 为 undefined），此处统一按「无脱离窗口」
// 静默降级，避免 TypeError 与 Unchecked runtime.lastError 告警。

const STORAGE_KEY = '_detachWindowId';

/**
 * 从 storage 恢复脱离窗口 windowId，并校验窗口是否仍然存在。
 * @returns {Promise<number|null>} 有效的 windowId；无记录 / 读取失败 / 窗口已销毁时为 null
 */
export async function restoreDetachWindowId() {
  let stored;
  try {
    stored = await chrome.storage.local.get(STORAGE_KEY);
  } catch {
    // 扩展重载 / SW 终止竞态：storage 暂不可用，放弃本次恢复
    return null;
  }
  const windowId = stored?.[STORAGE_KEY] || null;
  if (!windowId) return null;
  try {
    await chrome.windows.get(windowId);
    return windowId;
  } catch {
    // 窗口已不存在：清理残留记录
    chrome.storage.local.remove(STORAGE_KEY).catch(() => {});
    return null;
  }
}
