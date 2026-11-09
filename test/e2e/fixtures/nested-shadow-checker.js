// nested-shadow-checker.js - iframe/shadow 嵌套测试页的共享逻辑
// 提供：1) 把 <template> 内容挂到宿主元素构造 Shadow DOM；
//       2) 「本帧污染检查」按钮：遍历本文档（含 shadow 根）里的所有 contenteditable，
//          抓取其文本，检测是否混入了划词工具条的按钮文案（验证工具条是否泄漏进编辑区）。
// 说明：跨 file:// iframe 直接读 contentDocument 可能被浏览器按不透明源拦截，
//       因此检查以「本帧自检」为准——每个嵌套层都各自带一个检查按钮，逐帧点击即可覆盖全部层级。
(function () {
  'use strict';

  // 划词工具条 / 结果面板里会出现的特征文案（一旦出现在编辑区文本里即视为污染）
  var FORBIDDEN = ['AI搜索', '解释', '翻译', '总结', '复制', '问问', '更多工具', '发送', '推荐追问', '继续提问'];

  // 为带 data-shadow="<templateId>" 的宿主元素构建开放 Shadow DOM
  function buildShadow(host) {
    if (host.shadowRoot) return host.shadowRoot;
    var tplId = host.getAttribute('data-shadow');
    var tpl = tplId && document.getElementById(tplId);
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = tpl ? tpl.innerHTML : '';
    return root;
  }

  // 递归收集本文档中所有“真正可编辑”元素（contenteditable=true；穿透 shadow 根；尽力穿透同源 iframe）
  // 排除我方浮层自身（带 data-aih，含 contenteditable=false 的工具条/结果面板），避免把工具条误判为编辑区
  function collectEditables(node, acc) {
    if (!node) return;
    if (node.shadowRoot) collectEditables(node.shadowRoot, acc);
    var els = node.querySelectorAll ? node.querySelectorAll('[contenteditable="true"]') : [];
    Array.prototype.forEach.call(els, function (el) {
      if (el.closest && el.closest('[data-aih]')) return; // 跳过我方浮层内部
      acc.push(el);
    });
    var frames = node.querySelectorAll ? node.querySelectorAll('iframe') : [];
    Array.prototype.forEach.call(frames, function (f) {
      try {
        if (f.contentDocument) collectEditables(f.contentDocument, acc);
      } catch (e) { /* 跨源拦截，忽略——该帧自带检查按钮 */ }
    });
  }

  function checkThisFrame(outEl) {
    var acc = [];
    collectEditables(document, acc);
    var hits = [];
    acc.forEach(function (el) {
      var text = (el.innerText || el.textContent || '');
      var found = FORBIDDEN.filter(function (w) { return text.indexOf(w) !== -1; });
      if (found.length) {
        hits.push({ label: el.getAttribute('data-label') || el.id || el.className, leaked: found });
      }
    });
    // 附带导出各编辑区文本快照，便于肉眼核对
    var dump = acc.map(function (el, i) {
      var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      return '[' + (el.getAttribute('data-label') || ('编辑区' + (i + 1))) + '] ' + (t.slice(0, 200) || '(空)');
    }).join('\n');
    if (hits.length) {
      outEl.style.color = '#c00';
      outEl.textContent = '❌ 检测到污染：' + JSON.stringify(hits, null, 2) + '\n\n--- 编辑区文本快照 ---\n' + dump;
    } else {
      outEl.style.color = '#080';
      outEl.textContent = '✅ 本帧未发现工具条文本泄漏进任何编辑区\n\n--- 编辑区文本快照 ---\n' + dump;
    }
  }

  window.AIShadowNest = {
    init: function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-shadow]'), buildShadow);
      var btn = document.getElementById('check-btn');
      var out = document.getElementById('check-out');
      if (btn && out) {
        btn.addEventListener('click', function () { checkThisFrame(out); });
      }
    },
    FORBIDDEN: FORBIDDEN
  };
})();
