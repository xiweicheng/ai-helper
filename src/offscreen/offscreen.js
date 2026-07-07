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
    try {
      const textarea = document.getElementById('clipboard-textarea');
      textarea.value = '';
      textarea.focus();
      const success = document.execCommand('paste');
      if (success) {
        sendResponse({ success: true, text: textarea.value });
      } else {
        sendResponse({ success: false, error: '粘贴失败' });
      }
      textarea.value = '';
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
});
