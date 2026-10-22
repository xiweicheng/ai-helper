// file-extract.js - 浏览器端文件内容提取模块
// 支持 PDF、Word(.docx)、Excel(.xlsx)、纯文本等文件类型

import state from './state.js';
// pdfjs-dist / mammoth / xlsx 已改为按需动态加载，避免首屏 bundle 过大
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { decodeSecret } from '../shared/secret.js';
import {
  extractDocxImagesFromFile,
  extractPdfImagesFromFile,
  compressForVision,
  describeImages,
  buildImageBlock,
  VISION_CONSTANTS,
} from './doc-images.js';

registerTranslations('zh', {
  fileExtract: {
    fileReadFailed: '文件读取失败',
    oldDocNotSupported: '旧版 .doc 格式不支持，请用 Word 另存为 .docx 格式后再试',
    agentNotPaired: 'Agent 未配对',
    agentUploadFailed: 'Agent 上传失败 ({status}): {error}',
    unsupportedFormat: '暂不支持 "{name}" 格式的浏览器端提取，请连接 Agent 后再试',
    oldDocNotSupportedBrowser: '旧版 .doc 格式浏览器不支持，请用 Word 另存为 .docx 格式后再试',
    extracting: '提取中...',
    failed: '失败',
    extractFailed: '提取失败',
    removeFile: '移除文件',
    workspaceFileMarker: '[工作目录文件: {path} (原名: {name})]',
    truncated: '...(内容已截断)',
    fileContentMarker: '[文件内容: {name}]',
  },
});
registerTranslations('en', {
  fileExtract: {
    fileReadFailed: 'File read failed',
    oldDocNotSupported: 'Legacy .doc format is not supported. Please save as .docx in Word and try again.',
    agentNotPaired: 'Agent not paired',
    agentUploadFailed: 'Agent upload failed ({status}): {error}',
    unsupportedFormat: 'Browser-side extraction for "{name}" is not supported. Please connect an Agent and try again.',
    oldDocNotSupportedBrowser: 'Legacy .doc format is not supported in the browser. Please save as .docx in Word and try again.',
    extracting: 'Extracting...',
    failed: 'Failed',
    extractFailed: 'Extraction failed',
    removeFile: 'Remove file',
    workspaceFileMarker: '[Workspace file: {path} (original name: {name})]',
    truncated: '...(content truncated)',
    fileContentMarker: '[File content: {name}]',
  },
});

// PDF.js Worker 配置已移至 extractPdfFile 内部按需设置

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
    reader.onerror = () => reject(new Error(t('fileExtract.fileReadFailed')));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * 提取 PDF 文件内容（使用 PDF.js）
 */
async function extractPdfFile(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
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
  const mammoth = (await import('mammoth')).default;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * 提取 Excel(.xlsx/.xls) 文件内容（使用 SheetJS）
 */
async function extractExcelFile(file) {
  const XLSX = await import('xlsx');
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
      throw new Error(t('fileExtract.oldDocNotSupported'));
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
 * 读取当前激活 Agent 的连接信息（token 已解码）
 * @returns {Promise<{url: string, token: string}|null>}
 */
export async function getAgentConnectionInfo() {
  const storage = await chrome.storage.local.get(['pairedAgents', 'activeAgentId']);
  const agents = (storage.pairedAgents || []).map(a => a.token ? { ...a, token: decodeSecret(a.token) } : a);
  const active = agents.find(a => a.id === storage.activeAgentId);
  if (!active?.url || !active?.token) return null;
  return { url: active.url, token: active.token };
}

/**
 * 上传文件到 Agent 工作目录
 * @param {File} file - 浏览器 File 对象
 * @returns {Promise<{path: string, text?: string}>} Agent 返回的文件路径和可选文本
 */
export async function uploadFileToAgent(file) {
  const agent = await getAgentConnectionInfo();
  if (!agent) {
    throw new Error(t('fileExtract.agentNotPaired'));
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${agent.url}/api/files/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${agent.token}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(t('fileExtract.agentUploadFailed', { status: response.status, error: errorBody }));
  }

  const result = await response.json();
  return { path: result.path || '', text: result.text || '' };
}

// —— 文档图片链路（开关唯一入口 state.enableImageInput；任何失败不阻断文本主链路）——

/** Agent JSON POST 封装（extract-images 用） */
async function agentPostToActive(jsonPath, body) {
  const agent = await getAgentConnectionInfo();
  if (!agent) throw new Error(t('fileExtract.agentNotPaired'));
  const resp = await fetch(`${agent.url}${jsonPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.token}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

/** Agent 模式 docx：服务端抽图落盘 + 清单；前 DESCRIBE_LIMIT 张经 /api/fs/download 现拉供转述 */
async function runAgentDocxImages(fileEntry) {
  const manifest = await agentPostToActive('/api/documents/extract-images', { path: fileEntry.agentPath });
  if (!manifest || manifest.success !== true) throw new Error(manifest?.error || 'extractFailed');
  fileEntry.images = manifest.images;
  fileEntry.truncated = manifest.truncated || 0;
  fileEntry.skipped = manifest.skipped || 0;
  fileEntry.imageSource = 'agent';
  const agent = await getAgentConnectionInfo();
  if (!agent) return;
  for (const im of (fileEntry.images || []).slice(0, VISION_CONSTANTS.DESCRIBE_LIMIT)) {
    try {
      const dl = await fetch(`${agent.url}/api/fs/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agent.token}` },
        body: JSON.stringify({ path: im.path }),
      }).then(r => r.json());
      if (dl.success && dl.content) {
        const c = await compressForVision(`data:${dl.mimeType};base64,${dl.content}`);
        if (c === null) im.overLimit = true; else im.dataUrl = c;
      }
    } catch { /* 单图下载失败：保留清单条目，转述跳过该图 */ }
  }
}

/** 浏览器本地抽图（docx/pdf 均可；Agent 失败时的降级路径） */
async function runLocalImages(fileEntry, file, category) {
  const { images, truncated, skipped } = category === 'docx'
    ? await extractDocxImagesFromFile(file)
    : await extractPdfImagesFromFile(file);
  for (const im of images) {
    const c = await compressForVision(im.dataUrl);
    if (c === null) { im.overLimit = true; delete im.dataUrl; } else { im.dataUrl = c; }
  }
  fileEntry.images = images;
  fileEntry.truncated = truncated;
  fileEntry.skipped = skipped;
  fileEntry.imageSource = 'local';
}

/**
 * 图片链路编排（导出仅供测试）：副作用写 fileEntry 的
 * images/imageSource/imageDescriptions/truncated/skipped/imageStatus
 */
export async function runImagePipeline(fileEntry, file, category, isAgentMode) {
  if (!state.enableImageInput) return;
  if (category !== 'docx' && category !== 'pdf') return;
  try {
    if (isAgentMode && category === 'docx') {
      try {
        await runAgentDocxImages(fileEntry);
      } catch (agentErr) {
        logger.warn('[FileExtract] agent image extract failed, downgrade to local:', agentErr.message);
        await runLocalImages(fileEntry, file, category);
      }
    } else {
      await runLocalImages(fileEntry, file, category);
    }
    if (!fileEntry.images || fileEntry.images.length === 0) { fileEntry.imageStatus = 'none'; return; }
    fileEntry.imageStatus = 'extracted';
    fileEntry.imageDescriptions = await describeImages(fileEntry.images.filter(im => im.dataUrl), VISION_CONSTANTS.DESCRIBE_LIMIT);
    fileEntry.imageStatus = 'described';
  } catch (err) {
    logger.warn('[FileExtract] image pipeline failed (degrade):', file.name, err.message);
    if (!fileEntry.images) fileEntry.imageStatus = 'error';
  }
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
        await runImagePipeline(fileEntry, file, category, true);
        renderFilePreviews();
        return;
      } catch (agentErr) {
        logger.warn('[FileExtract] Agent upload failed,downgrade to browserside extraction:', agentErr.message);
      }
    }

    // 浏览器端提取（Agent 不可用时的降级方案，仅支持部分格式）
    if (category === 'unknown') {
      throw new Error(t('fileExtract.unsupportedFormat', { name: file.name }));
    }
    if (category === 'doc') {
      throw new Error(t('fileExtract.oldDocNotSupportedBrowser'));
    }

    fileEntry.text = await extractFileContent(file);
    fileEntry.status = 'done';
    await runImagePipeline(fileEntry, file, category, false);
  } catch (err) {
    logger.error('[FileExtract] file extract failed:', file.name, err);
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

    if (file.isImage && file.dataUrl) {
      const img = document.createElement('img');
      img.className = 'file-preview-thumb';
      img.src = file.dataUrl;
      img.alt = file.name;
      wrapper.appendChild(img);
      
      const label = document.createElement('span');
      label.className = 'file-preview-thumb-label';
      label.textContent = file.name;
      wrapper.appendChild(label);
    } else {
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
      wrapper.appendChild(icon);
      wrapper.appendChild(info);
    }

    // 状态标签
    if (file.status === 'extracting') {
      const status = document.createElement('span');
      status.className = 'file-preview-status extracting';
      status.textContent = t('fileExtract.extracting');
      wrapper.appendChild(status);
    } else if (file.status === 'error') {
      const status = document.createElement('span');
      status.className = 'file-preview-status error';
      status.textContent = t('fileExtract.failed');
      status.title = file.error || t('fileExtract.extractFailed');
      wrapper.appendChild(status);
    } else if (file.status === 'done') {
      const status = document.createElement('span');
      status.className = 'file-preview-status done';
      status.textContent = '✓';
      wrapper.appendChild(status);
    }

    // 📷 图片链路状态行
    if (file.images && file.images.length > 0) {
      const imgTag = document.createElement('span');
      imgTag.className = 'file-preview-status images';
      if (file.imageStatus === 'error') {
        imgTag.textContent = t('docImages.previewFail');
      } else {
        const descs = file.imageDescriptions || {};
        const described = file.images.filter(im => descs[im.index]).length;
        imgTag.textContent = t('docImages.previewDescribed', { described, total: file.images.length });
      }
      wrapper.appendChild(imgTag);
    } else if (!state.enableImageInput && ['docx', 'pdf'].includes(getFileCategory(file.name))) {
      wrapper.title = `${wrapper.title} — ${t('docImages.previewOff')}`;
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-preview-remove';
    removeBtn.innerHTML = '×';
    removeBtn.title = t('fileExtract.removeFile');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(index);
    });

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

  // Agent 上传的文件：提供文件路径供大模型工具操作；有图时清单块紧跟标记之后
  for (const file of agentFiles) {
    parts.push(t('fileExtract.workspaceFileMarker', { path: file.agentPath, name: file.name }) + buildImageBlock(file, file.name));
  }

  // 浏览器提取的文件：直接附带文本内容；有图时清单块紧跟正文之后
  for (const file of browserFiles) {
    const text = file.text.length > 50000 ? file.text.substring(0, 50000) + '\n' + t('fileExtract.truncated') : file.text;
    parts.push(t('fileExtract.fileContentMarker', { name: file.name }) + '\n' + text + buildImageBlock(file, file.name));
  }

  return '\n\n' + parts.join('\n\n---\n\n');
}