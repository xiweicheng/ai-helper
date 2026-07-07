/**
 * Post-build script to fix @crxjs/vite-plugin issues
 *
 * This script:
 * 1. Finds the correct background, content, and side_panel script files
 * 2. Fixes service-worker-loader.js to import the correct background script
 * 3. Fixes manifest.json to reference the correct content script
 * 4. Fixes side_panel.html to inject the missing script entry (Vite bug workaround)
 * 5. Cleans up dev-mode artifacts (vendor/, dev fallbacks, duplicates, etc.)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');
const assetsDir = path.join(distDir, 'assets');

// Find the correct background file (contains chrome.sidePanel.setPanelBehavior)
function findBackgroundFile(assetsDir) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if (file.startsWith('background-') && file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
      if (content.includes('chrome.sidePanel')) {
        return file;
      }
    }
  }
  return null;
}

// Find the correct content file (contains DOM operations)
function findContentFile(assetsDir) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if (file.startsWith('content-') && file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
      if (content.includes('document.querySelector') && content.includes('chrome.runtime.onMessage')) {
        return file;
      }
    }
  }
  return null;
}

// Find the side_panel chunk file
function findSidePanelFile(assetsDir) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if (file.startsWith('side_panel-') && file.endsWith('.js')) {
      return file;
    }
  }
  return null;
}

// Recursively delete a directory
function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
  console.log(`🗑️  Removed dir: ${path.relative(distDir, dirPath)}/`);
}

// Delete a file if it exists
function removeFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.unlinkSync(filePath);
  console.log(`🗑️  Removed file: ${path.relative(distDir, filePath)}`);
}

// Clean up dev-mode artifacts and build residue
function cleanDevArtifacts() {
  console.log('🧹 Cleaning dev artifacts...\n');

  // 1. dev server 客户端代码（整个 vendor/ 目录）
  removeDir(path.join(distDir, 'vendor'));

  // 2. dev 模式下 dist/src/ 下的重复源文件
  removeDir(path.join(distDir, 'src'));

  // 3. dev 模式生成的 side_panel.html / options.html fallback 错误页
  const sidePanelHtml = path.join(distDir, 'side_panel.html');
  if (fs.existsSync(sidePanelHtml)) {
    const content = fs.readFileSync(sidePanelHtml, 'utf-8');
    if (content.includes('CRXJS DEV MODE') || content.includes('Failed to load the script')) {
      removeFile(sidePanelHtml);
    }
  }

  // 4. lib loader 文件（实际入口是 libs/qrcode.min.js）
  removeFile(path.join(distDir, 'libs', 'qrcode.min.js-loader.js'));
  removeFile(path.join(distDir, 'libs', 'qrcode.min.js.js'));

  // 5. styles.css 的 js 副本（不需要）
  removeFile(path.join(distDir, 'styles', 'styles.css.js'));

  // 6. assets/ 下用不到的文件
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      // dev 模式注入的 index.html 入口相关文件
      if (file.startsWith('index.js-') || file.startsWith('index.js-loader')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
      // dev 模式 loading page
      if (file.startsWith('loading-page')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
      // crxjs 生成的 manifest sourcemap
      if (file.startsWith('crx-manifest.js') && file.endsWith('.map')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
      // 重复打包的 qrcode（libs/ 下已经有原版了）
      if (file.startsWith('qrcode.min.js-')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
    }
  }

  console.log('');
}

// Main fix function
function fixBuild() {
  const manifestPath = path.join(distDir, 'manifest.json');
  const loaderPath = path.join(distDir, 'service-worker-loader.js');

  console.log('🔧 Fixing build artifacts...\n');

  // Find the correct files
  const backgroundFile = findBackgroundFile(assetsDir);
  const contentFile = findContentFile(assetsDir);
  const sidePanelFile = findSidePanelFile(assetsDir);

  if (!backgroundFile) {
    console.error('❌ Could not find background script');
    process.exit(1);
  }

  if (!contentFile) {
    console.error('❌ Could not find content script');
    process.exit(1);
  }

  console.log(`✅ Found background: ${backgroundFile}`);
  console.log(`✅ Found content: ${contentFile}`);

  // Fix service-worker-loader.js
  fs.writeFileSync(loaderPath, `import './assets/${backgroundFile}';\n`);
  console.log(`✅ Fixed service-worker-loader.js`);

  // Fix side_panel.html: Vite 打包后可能丢失入口 script 标签，手动注入
  if (sidePanelFile) {
    console.log(`✅ Found side_panel: ${sidePanelFile}`);
    const sidePanelHtmlPath = path.join(distDir, 'side_panel.html');
    if (fs.existsSync(sidePanelHtmlPath)) {
      let html = fs.readFileSync(sidePanelHtmlPath, 'utf-8');
      // 检查是否已有 side_panel 的 script 引用
      if (!html.includes(sidePanelFile)) {
        // 在 </body> 前注入
        html = html.replace(
          '</body>',
          `  <script type="module" crossorigin src="/assets/${sidePanelFile}"></script>\n</body>`
        );
        fs.writeFileSync(sidePanelHtmlPath, html);
        console.log(`✅ Fixed side_panel.html: injected script entry`);
      } else {
        console.log(`✅ side_panel.html already has script entry`);
      }
    }
  } else {
    console.warn('⚠️  Could not find side_panel chunk file');
  }

  // Fix manifest.json
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Fix content_scripts: 替换为 libs/ 下实际存在的脚本 + content chunk
  if (manifest.content_scripts && manifest.content_scripts[0]) {
    const oldJs = JSON.stringify(manifest.content_scripts[0].js);
    // 查找 dist/libs/ 下的 .js 文件，排除 mermaid（仅 side_panel 使用）
    const libsDir = path.join(distDir, 'libs');
    const libFiles = fs.existsSync(libsDir) 
      ? fs.readdirSync(libsDir)
          .filter(f => f.endsWith('.js') && f !== 'mermaid.min.js')
          .map(f => `libs/${f}`)
      : [];
    manifest.content_scripts[0].js = [
      ...libFiles,
      `assets/${contentFile}`
    ];
    console.log(`✅ Fixed content_scripts: ${oldJs} -> ${JSON.stringify(manifest.content_scripts[0].js)}`);
  }

  // Fix web_accessible_resources
  if (manifest.web_accessible_resources && manifest.web_accessible_resources[0]) {
    manifest.web_accessible_resources[0].resources = [
      `assets/${contentFile}`,
      `assets/${backgroundFile}`
    ];
    console.log(`✅ Fixed web_accessible_resources`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✅ Fixed manifest.json`);

  console.log('');

  // 将 hash 文件名重命名为固定文件名，避免每次构建后需重新加载扩展
  renameToStableNames(assetsDir, backgroundFile, contentFile, sidePanelFile);
}

// 将 hash 文件名重命名为固定文件名，避免每次构建后需重新加载扩展
function renameToStableNames(assetsDir, backgroundFile, contentFile, sidePanelFile) {
  const distDir = path.join(assetsDir, '..');
  const manifestPath = path.join(distDir, 'manifest.json');
  const loaderPath = path.join(distDir, 'service-worker-loader.js');
  const sidePanelHtmlPath = path.join(distDir, 'side_panel.html');
  const optionsHtmlPath = path.join(distDir, 'options.html');

  // 构建映射：hash文件名 → 稳定文件名
  const renameMap = {};
  const addEntry = (hashName, stableName) => {
    if (hashName) renameMap[hashName] = stableName;
  };

  addEntry(backgroundFile, 'background.js');
  addEntry(contentFile, 'content.js');
  addEntry(sidePanelFile, 'side_panel.js');

  // 也查找 options hash 文件
  const files = fs.readdirSync(assetsDir);
  const optionsFile = files.find(f => f.startsWith('options-') && f.endsWith('.js'));
  const sidePanelCssFile = files.find(f => f.startsWith('side_panel-') && f.endsWith('.css'));
  if (optionsFile) addEntry(optionsFile, 'options.js');
  if (sidePanelCssFile) addEntry(sidePanelCssFile, 'side_panel.css');

  // 执行重命名
  for (const [hashName, stableName] of Object.entries(renameMap)) {
    const oldPath = path.join(assetsDir, hashName);
    const newPath = path.join(assetsDir, stableName);
    if (fs.existsSync(oldPath) && hashName !== stableName) {
      // 如果目标文件已存在（上次构建残留），先删除
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
      fs.renameSync(oldPath, newPath);
      console.log(`📦 Renamed: assets/${hashName} → assets/${stableName}`);
    }

    // 同样重命名 .map 文件
    const oldMap = path.join(assetsDir, hashName + '.map');
    const newMap = path.join(assetsDir, stableName + '.map');
    if (fs.existsSync(oldMap)) {
      if (fs.existsSync(newMap)) fs.unlinkSync(newMap);
      fs.renameSync(oldMap, newMap);
      console.log(`📦 Renamed: assets/${hashName}.map → assets/${stableName}.map`);
    }
  }

  // 更新所有引用
  function replaceInFile(filePath, map) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;
    for (const [oldName, newName] of Object.entries(map)) {
      if (content.includes(oldName)) {
        content = content.replaceAll(oldName, newName);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated references in: ${path.relative(distDir, filePath)}`);
    }
  }

  replaceInFile(loaderPath, renameMap);
  replaceInFile(manifestPath, renameMap);
  replaceInFile(sidePanelHtmlPath, renameMap);
  replaceInFile(optionsHtmlPath, renameMap);

  console.log('');
}

// 修复后 dist 根目录可能残留不再被引用的入口文件
function removeOrphanedEntries() {
  removeFile(path.join(distDir, 'content.js'));
}

// 复制 offscreen document 到 dist
function copyOffscreenDocument() {
  const srcDir = path.join(__dirname, '..', 'src', 'offscreen');
  const destDir = path.join(distDir, 'offscreen');
  
  if (!fs.existsSync(srcDir)) {
    console.log('⚠️  offscreen 源目录不存在，跳过');
    return;
  }
  
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const files = fs.readdirSync(srcDir);
  for (const file of files) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    fs.copyFileSync(srcFile, destFile);
    console.log(`📋 Copied offscreen/${file}`);
  }
}

cleanDevArtifacts();
fixBuild();
removeOrphanedEntries();
copyOffscreenDocument();

console.log('✅ Build artifacts fixed successfully!\n');
