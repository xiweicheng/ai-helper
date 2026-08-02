import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  offscreen: {
    copiedToClipboard: '已复制到剪贴板',
    copyFailed: '复制失败: {error}',
    pasteFailed: '无法读取剪贴板：{error}',
  },
});
registerTranslations('en', {
  offscreen: {
    copiedToClipboard: 'Copied to clipboard',
    copyFailed: 'Copy failed: {error}',
    pasteFailed: 'Cannot read clipboard: {error}',
  },
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'COPY_TO_CLIPBOARD') {
    navigator.clipboard.writeText(message.text)
      .then(() => {
        sendResponse({ success: true, message: t('offscreen.copiedToClipboard') });
      })
      .catch(err => {
        try {
          const textarea = document.getElementById('clipboard-textarea');
          textarea.value = message.text;
          textarea.select();
          const success = document.execCommand('copy');
          textarea.value = '';
          if (success) {
            sendResponse({ success: true, message: t('offscreen.copiedToClipboard') });
          } else {
            sendResponse({ success: false, error: t('offscreen.copyFailed', { error: err.message || err }) });
          }
        } catch (e) {
          sendResponse({ success: false, error: t('offscreen.copyFailed', { error: e.message || e }) });
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
            sendResponse({ success: false, error: t('offscreen.pasteFailed', { error: err.message || err }) });
          }
        } catch (e) {
          sendResponse({ success: false, error: t('offscreen.pasteFailed', { error: e.message || e }) });
        }
      });
    return true;
  }
});
