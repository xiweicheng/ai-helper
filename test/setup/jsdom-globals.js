// test/setup/jsdom-globals.js - jsdom 缺失 API 补丁（仅 jsdom 环境生效，node 环境跳过）
// 真实浏览器有这些 API，jsdom 未实现，补 no-op/polyfill 让逻辑测试可运行
if (typeof window !== 'undefined' && typeof Element !== 'undefined') {
  // jsdom 未实现 Element.scrollIntoView / Element.scrollTo
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = function () {};
  }
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = function () {};
  }
  // NodeList 标准仅提供 forEach，补 some/map/filter 供源码使用
  if (typeof NodeList !== 'undefined') {
    if (typeof NodeList.prototype.some !== 'function') {
      NodeList.prototype.some = Array.prototype.some;
    }
    if (typeof NodeList.prototype.map !== 'function') {
      NodeList.prototype.map = Array.prototype.map;
    }
    if (typeof NodeList.prototype.filter !== 'function') {
      NodeList.prototype.filter = Array.prototype.filter;
    }
  }
}
