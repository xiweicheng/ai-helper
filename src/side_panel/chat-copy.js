// chat-copy.js - 聊天消息复制与引用功能
// 从 chat-manager.js 拆分，负责用户/助手消息的复制、富文本复制、引用提问

import state from './state.js';
import { showToast } from './utils.js';
import { formatMarkdown } from './markdown-render.js';
import logger from '../shared/logger.js';

/**
 * 复制用户消息纯文本
 */
export function copyMessage(messageDiv, copyBtn) {
  try {
    const textToCopy = messageDiv.dataset.textContent_ || messageDiv.dataset.rawContent || '';

    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `;
      copyBtn.classList.add('copied');

      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      logger.error('[SidePanel] 复制失败:', err);
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `;
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        showToast('复制失败', 'error');
      }
      document.body.removeChild(textArea);
    });
  } catch (error) {
    logger.error('[SidePanel] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

/**
 * 复制助手消息：默认复制 Markdown，按住 Ctrl/Cmd 复制富文本
 */
export function copyAssistantMessage(messageDiv, copyBtn, event) {
  try {
    let textToCopy = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';
    let htmlToCopy = '';

    if (!textToCopy) {
      const lastMsg = state.messageHistory.find(msg => msg.role === 'assistant');
      if (lastMsg) {
        textToCopy = lastMsg.content;
      } else {
        const finalAnswer = messageDiv.querySelector('.final-answer .markdown-body') || messageDiv.querySelector('.markdown-body');
        if (finalAnswer) {
          textToCopy = finalAnswer.innerText;
          htmlToCopy = finalAnswer.innerHTML;
        } else {
          textToCopy = messageDiv.innerText;
          htmlToCopy = messageDiv.innerHTML;
        }
      }
    }

    if (!htmlToCopy) {
      const finalAnswer = messageDiv.querySelector('.final-answer .markdown-body') || messageDiv.querySelector('.markdown-body');
      if (finalAnswer) {
        htmlToCopy = finalAnswer.innerHTML;
      } else if (textToCopy) {
        htmlToCopy = formatMarkdown(textToCopy);
      }
    }

    const isCtrlPressed = event && (event.ctrlKey || event.metaKey);

    if (isCtrlPressed && htmlToCopy) {
      copyRichText(textToCopy, htmlToCopy, copyBtn);
    } else {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showCopySuccess(copyBtn);
      }).catch(err => {
        fallbackCopyText(textToCopy, copyBtn);
      });
    }
  } catch (error) {
    logger.error('[SidePanel] 复制失败:', error);
    showToast('复制失败', 'error');
  }
}

export function showCopySuccess(copyBtn, isRichText = false) {
  const originalHTML = copyBtn.innerHTML;
  copyBtn.innerHTML = `
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>
    <span>${isRichText ? '已复制富文本' : '已复制Markdown'}</span>
  `;
  copyBtn.classList.add('copied');

  setTimeout(() => {
    copyBtn.innerHTML = originalHTML;
    copyBtn.classList.remove('copied');
  }, 2000);
}

export function fallbackCopyText(text, copyBtn) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    showCopySuccess(copyBtn);
  } catch (e) {
    showToast('复制失败，请手动选择内容复制', 'error');
  }
  document.body.removeChild(textArea);
}

export function copyRichText(text, html, copyBtn) {
  const styledHtml = wrapHtmlWithStyles(html);

  if (typeof ClipboardItem !== 'undefined') {
    const clipboardData = new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([styledHtml], { type: 'text/html' })
    });

    navigator.clipboard.write([clipboardData]).then(() => {
      showCopySuccess(copyBtn, true);
    }).catch(err => {
      fallbackCopyRichText(text, styledHtml, copyBtn);
    });
  } else {
    fallbackCopyRichText(text, styledHtml, copyBtn);
  }
}

export function wrapHtmlWithStyles(html) {
  const styles = `
    <style>
      h1 { font-size: 24px; font-weight: bold; margin: 16px 0 8px; }
      h2 { font-size: 20px; font-weight: bold; margin: 14px 0 6px; }
      h3 { font-size: 18px; font-weight: bold; margin: 12px 0 6px; }
      h4 { font-size: 16px; font-weight: bold; margin: 10px 0 6px; }
      p { margin: 6px 0; line-height: 1.6; }
      ul, ol { margin: 8px 0; padding-left: 24px; }
      li { margin: 4px 0; }
      blockquote { border-left: 4px solid #ddd; padding-left: 12px; margin: 8px 0; color: #666; }
      code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
      pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
      pre code { background: none; padding: 0; }
      table { border-collapse: collapse; width: 100%; margin: 8px 0; }
      th, td { border: 1px solid #ddd; padding: 6px 12px; text-align: left; }
      th { background: #f9f9f9; font-weight: bold; }
      strong { font-weight: bold; }
      em { font-style: italic; }
      a { color: #007bff; text-decoration: underline; }
      img { max-width: 100%; }
    </style>
  `;

  return `<!DOCTYPE html><html><head>${styles}</head><body>${html}</body></html>`;
}

/**
 * 富文本复制兜底方案：通过临时 DOM + execCommand('copy')
 */
export function fallbackCopyRichText(text, html, copyBtn) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-999999px';
  container.style.top = '-999999px';
  container.innerHTML = html;
  document.body.appendChild(container);

  const range = document.createRange();
  range.selectNodeContents(container);

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    document.execCommand('copy');
    showCopySuccess(copyBtn);
  } catch (e) {
    fallbackCopyText(text, copyBtn);
  } finally {
    selection.removeAllRanges();
    document.body.removeChild(container);
  }
}

/**
 * 引用消息内容到输入框提示条，并聚焦输入框
 * 依赖 setQuoteContext（由 chat-manager.js 注入），避免循环依赖
 */
let _setQuoteContext = null;

/**
 * 注入 setQuoteContext 实现（由 chat-manager.js 调用），打破循环依赖
 * @param {(content: string) => void} fn
 */
export function setQuoteContextInjector(fn) {
  _setQuoteContext = fn;
}

export function quoteAndAsk(messageDiv) {
  try {
    const content = messageDiv.dataset.rawMarkdown || messageDiv.dataset.rawContent || '';

    if (!content) {
      logger.warn('[SidePanel] 无法获取消息内容');
      return;
    }

    const userInput = document.getElementById('userInput');
    if (!userInput) {
      logger.warn('[SidePanel] 找不到输入框');
      return;
    }

    const quoteBtn = messageDiv.querySelector('.quote-btn');
    const originalHTML = quoteBtn ? quoteBtn.innerHTML : '';

    if (_setQuoteContext) {
      _setQuoteContext(content);
    }

    if (quoteBtn) {
      quoteBtn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `;
      quoteBtn.classList.add('quoted');

      setTimeout(() => {
        quoteBtn.innerHTML = originalHTML;
        quoteBtn.classList.remove('quoted');
      }, 2000);
    }

    userInput.focus();

    logger.debug('[SidePanel] 已引用消息内容到提示条，输入框已获取焦点');
  } catch (error) {
    logger.error('[SidePanel] 引用提问失败:', error);
    showToast('引用失败: ' + error.message, 'error');
  }
}
