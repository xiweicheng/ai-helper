chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COPY_TO_CLIPBOARD') {
    try {
      const textarea = document.getElementById('clipboard-textarea');
      textarea.value = message.text;
      textarea.select();
      const success = document.execCommand('copy');
      textarea.value = '';
      if (success) {
        sendResponse({ success: true, message: '已复制到剪贴板' });
      } else {
        sendResponse({ success: false, error: '复制失败' });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  if (message.type === 'PASTE_FROM_CLIPBOARD') {
    // 优先使用 navigator.clipboard.readText()
    navigator.clipboard.readText()
      .then(text => {
        sendResponse({ success: true, text: text });
      })
      .catch(err => {
        // 降级：尝试 execCommand('paste')（offscreen 中可能不工作，但作为兜底）
        try {
          const textarea = document.getElementById('clipboard-textarea');
          textarea.value = '';
          textarea.focus();
          const success = document.execCommand('paste');
          if (success && textarea.value) {
            sendResponse({ success: true, text: textarea.value });
          } else {
            sendResponse({ success: false, error: '无法读取剪贴板：' + (err.message || err) });
          }
          textarea.value = '';
        } catch (e) {
          sendResponse({ success: false, error: '无法读取剪贴板：' + e.message });
        }
      });
    return true;
  }
});
