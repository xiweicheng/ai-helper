chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COPY_TO_CLIPBOARD') {
    navigator.clipboard.writeText(message.text)
      .then(() => {
        sendResponse({ success: true, message: '已复制到剪贴板' });
      })
      .catch(err => {
        try {
          const textarea = document.getElementById('clipboard-textarea');
          textarea.value = message.text;
          textarea.select();
          const success = document.execCommand('copy');
          textarea.value = '';
          if (success) {
            sendResponse({ success: true, message: '已复制到剪贴板' });
          } else {
            sendResponse({ success: false, error: '复制失败: ' + (err.message || err) });
          }
        } catch (e) {
          sendResponse({ success: false, error: '复制失败: ' + (e.message || e) });
        }
      });
    return true;
  }

  if (message.type === 'PASTE_FROM_CLIPBOARD') {
    navigator.clipboard.readText()
      .then(text => {
        sendResponse({ success: true, text: text });
      })
      .catch(err => {
        try {
          const textarea = document.getElementById('clipboard-textarea');
          textarea.value = '';
          textarea.focus();
          const success = document.execCommand('paste');
          const resultText = textarea.value;
          textarea.value = '';
          if (success && resultText) {
            sendResponse({ success: true, text: resultText });
          } else {
            sendResponse({ success: false, error: '无法读取剪贴板：' + (err.message || err) });
          }
        } catch (e) {
          sendResponse({ success: false, error: '无法读取剪贴板：' + (e.message || e) });
        }
      });
    return true;
  }
});
