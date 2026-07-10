// file-extract.js - 浏览器端文件内容提取模块
// 支持 PDF、Word(.docx)、Excel(.xlsx)、纯文本等文件类型

import state from './state.js';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// 配置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';

// 文件类型映射
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx',
  '.html', '.css', '.scss', '.less', '.xml', '.yaml', '.yml',
  '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb',
  '.php', '.sql', '.sh', '.bash', '.zsh', '.cfg', '.ini',
  '.toml', '.conf', '.log', '.csv', '.tsv', '.env', '.gitignore',
  '.vue', '.svelte', '.astro', '.rtf', '.svg', '.bat', '.ps1',
  '.makefile', '.cmake', '.gradle', '.properties'
];

/**
 * 根据文件名判断文件类型分类
 */
export function getFileCategory(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.doc')) return 'doc';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (TEXT_EXTENSIONS.some(ext => lower.endsWith(ext))) return 'text';
  // 无扩展名或未知扩展名，尝试按 MIME 类型判断
  return 'unknown';
}

/**
 * 获取文件图标（emoji）
 */
export function getFileIcon(fileName) {
  const category = getFileCategory(fileName);
  switch (category) {
    case 'pdf': return '📄';
    case 'docx':
    case 'doc': return '📝';
    case 'xlsx': return '📊';
    case 'text': return '📃';
    default: return '📎';
  }
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 提取纯文本文件内容
 */
async function extractTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * 提取 PDF 文件内容（使用 PDF.js）
 */
async function extractPdfFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n\n');
}

/**
 * 提取 Word(.docx) 文件内容（使用 mammoth.js）
 */
async function extractDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * 提取 Excel(.xlsx/.xls) 文件内容（使用 SheetJS）
 */
async function extractExcelFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const textParts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    if (csvText.trim()) {
      textParts.push(`=== Sheet: ${sheetName} ===\n${csvText}`);
    }
  }

  return textParts.join('\n\n');
}

/**
 * 浏览器端提取文件内容（降级方案）
 * @param {File} file - 浏览器 File 对象
 * @returns {Promise<string>} 提取的文本内容
 */
export async function extractFileContent(file) {
  const category = getFileCategory(file.name);

  switch (category) {
    case 'pdf':
      return await extractPdfFile(file);
    case 'docx':
      return await extractDocxFile(file);
    case 'doc':
      // 旧版 .doc 格式不被 mammoth.js 支持，直接给出提示
      throw new Error('旧版 .doc 格式不支持，请用 Word 另存为 .docx 格式后再试');
    case 'xlsx':
      return await extractExcelFile(file);
    case 'text':
      return await extractTextFile(file);
    default:
      // 未知类型，尝试作为纯文本读取
      return await extractTextFile(file);
  }
}

/**
 * 上传文件到 Agent 工作目录
 * @param {File} file - 浏览器 File 对象
 * @returns {Promise<{path: string, text?: string}>} Agent 返回的文件路径和可选文本
 */
export async function uploadFileToAgent(file) {
  const storage = await chrome.storage.local.get(['agentUrl', 'agentToken']);
  const agentUrl = storage.agentUrl;
  const agentToken = storage.agentToken;

  if (!agentUrl || !agentToken) {
    throw new Error('Agent 未配对');
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${agentUrl}/api/files/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${agentToken}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Agent 上传失败 (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  return { path: result.path || '', text: result.text || '' };
}

/**
 * 处理单个文件：提取内容并更新状态
 * @param {File} file - 浏览器 File 对象
 * @param {number} index - 在 attachedFiles 中的索引
 */
export async function processFile(file, index) {
  const fileEntry = state.attachedFiles[index];
  if (!fileEntry) return;

  fileEntry.status = 'extracting';
  renderFilePreviews();

  const category = getFileCategory(file.name);

  try {
    // 优先上传到 Agent 工作目录（支持任意文件格式，大模型通过工具操作原始文件）
    if (state.agentPlatform?.connected) {
      try {
        const result = await uploadFileToAgent(file);
        fileEntry.agentPath = result.path;
        fileEntry.text = result.text || '';
        fileEntry.status = 'done';
        renderFilePreviews();
        return;
      } catch (agentErr) {
        console.warn('[FileExtract] Agent 上传失败，降级到浏览器端提取:', agentErr.message);
      }
    }

    // 浏览器端提取（Agent 不可用时的降级方案，仅支持部分格式）
    if (category === 'unknown') {
      throw new Error(`暂不支持 "${file.name}" 格式的浏览器端提取，请连接 Agent 后再试`);
    }
    if (category === 'doc') {
      throw new Error('旧版 .doc 格式浏览器不支持，请用 Word 另存为 .docx 格式后再试');
    }

    fileEntry.text = await extractFileContent(file);
    fileEntry.status = 'done';
  } catch (err) {
    console.error('[FileExtract] 文件提取失败:', file.name, err);
    fileEntry.status = 'error';
    fileEntry.error = err.message;
  }

  renderFilePreviews();
}

/**
 * 添加文件到附件列表
 * @param {File[]} files - 文件列表
 */
export function attachFiles(files) {
  for (const file of files) {
    // 检查是否已存在同名文件
    if (state.attachedFiles.some(f => f.name === file.name && f.size === file.size)) {
      continue;
    }

    const dataUrl = URL.createObjectURL(file);
    const entry = {
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl,
      text: '',
      status: 'pending'
    };

    state.attachedFiles.push(entry);
    const index = state.attachedFiles.length - 1;
    processFile(file, index);
  }

  renderFilePreviews();
}

/**
 * 移除文件附件
 * @param {number} index - 附件索引
 */
export function removeFile(index) {
  const fileEntry = state.attachedFiles[index];
  if (fileEntry?.dataUrl) {
    URL.revokeObjectURL(fileEntry.dataUrl);
  }
  state.attachedFiles.splice(index, 1);
  renderFilePreviews();
}

/**
 * 清空所有文件附件
 */
export function clearFiles() {
  for (const f of state.attachedFiles) {
    if (f.dataUrl) URL.revokeObjectURL(f.dataUrl);
  }
  state.attachedFiles = [];
  renderFilePreviews();
}

/**
 * 渲染文件预览栏
 */
export function renderFilePreviews() {
  const previewBar = document.getElementById('filePreviewBar');
  if (!previewBar) return;

  previewBar.innerHTML = '';

  if (state.attachedFiles.length === 0) {
    previewBar.style.display = 'none';
    return;
  }
  previewBar.style.display = '';

  state.attachedFiles.forEach((file, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'file-preview-item';
    wrapper.title = `${file.name} (${formatFileSize(file.size)})`;

    const icon = document.createElement('span');
    icon.className = 'file-preview-icon';
    icon.textContent = getFileIcon(file.name);

    const info = document.createElement('div');
    info.className = 'file-preview-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'file-preview-name';
    nameEl.textContent = file.name;

    const meta = document.createElement('span');
    meta.className = 'file-preview-meta';
    meta.textContent = formatFileSize(file.size);

    info.appendChild(nameEl);
    info.appendChild(meta);

    // 状态标签
    if (file.status === 'extracting') {
      const status = document.createElement('span');
      status.className = 'file-preview-status extracting';
      status.textContent = '提取中...';
      wrapper.appendChild(status);
    } else if (file.status === 'error') {
      const status = document.createElement('span');
      status.className = 'file-preview-status error';
      status.textContent = '失败';
      status.title = file.error || '提取失败';
      wrapper.appendChild(status);
    } else if (file.status === 'done') {
      const status = document.createElement('span');
      status.className = 'file-preview-status done';
      status.textContent = '✓';
      wrapper.appendChild(status);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-preview-remove';
    removeBtn.innerHTML = '×';
    removeBtn.title = '移除文件';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(index);
    });

    wrapper.appendChild(icon);
    wrapper.appendChild(info);
    wrapper.appendChild(removeBtn);
    previewBar.appendChild(wrapper);
  });
}

/**
 * 构建文件内容注入文本（用于发送给模型）
 * @returns {string} 文件内容文本
 */
export function buildFileContentText() {
  const doneFiles = state.attachedFiles.filter(f => f.status === 'done');
  if (doneFiles.length === 0) return '';

  const parts = [];
  const agentFiles = doneFiles.filter(f => f.agentPath);
  const browserFiles = doneFiles.filter(f => !f.agentPath && f.text);

  // Agent 上传的文件：提供文件路径供大模型工具操作
  for (const file of agentFiles) {
    parts.push(`[工作目录文件: ${file.agentPath} (原名: ${file.name})]`);
  }

  // 浏览器提取的文件：直接附带文本内容
  for (const file of browserFiles) {
    const text = file.text.length > 50000 ? file.text.substring(0, 50000) + '\n...(内容已截断)' : file.text;
    parts.push(`[文件内容: ${file.name}]\n${text}`);
  }

  return '\n\n' + parts.join('\n\n---\n\n');
}