/**
 * Post-build script to fix @crxjs/vite-plugin issues
 *
 * This script:
 * 1. Finds the correct background, content, and side_panel script files
 * 2. Bundles content.js and its dependencies into a single IIFE file (no import/export)
 * 3. Fixes service-worker-loader.js to import the correct background script
 * 4. Fixes manifest.json to reference the correct content script
 * 5. Fixes side_panel.html to inject the missing script entry (Vite bug workaround)
 * 6. Cleans up dev-mode artifacts (vendor/, dev fallbacks, duplicates, etc.)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import { resolveContentScriptLibs } from './content-libs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');
const assetsDir = path.join(distDir, 'assets');

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

function findContentFile(assetsDir) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if ((file.startsWith('content-') || file.startsWith('index.js-')) && file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
      if (content.includes('document.querySelector') && content.includes('chrome.runtime.onMessage')) {
        return file;
      }
    }
  }
  return null;
}

function findSidePanelFile(assetsDir) {
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if (file.startsWith('side_panel-') && file.endsWith('.js')) {
      return file;
    }
  }
  return null;
}

function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
  console.log(`🗑️  Removed dir: ${path.relative(distDir, dirPath)}/`);
}

function removeFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.unlinkSync(filePath);
  console.log(`🗑️  Removed file: ${path.relative(distDir, filePath)}`);
}

function patchJsPDFRemoteCode(libsDir) {
  // Chrome MV3 政策禁止远程托管代码（拒审参考 ID: Blue Argon）。
  // jsPDF 官方打包在 pdfobjectnewwindow 模式（本扩展未使用，仅用 pdf.save() 下载）中
  // 内置 cdnjs PDFObject URL，会被商店自动扫描命中。将该死代码路径中的远程 URL
  // 中和为本地 blob 页，消除扫描信号；pdf.save 正常路径不受影响。
  const file = path.join(libsDir, 'jspdf.min.js');
  if (!fs.existsSync(file)) {
    console.warn('⚠️  libs/jspdf.min.js not found, skip remote-code patch');
    return;
  }
  const remoteUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js';
  let content = fs.readFileSync(file, 'utf-8');
  if (!content.includes(remoteUrl)) {
    console.log('✅ jspdf.min.js already free of remote-code URL');
    return;
  }
  const from = 'case"pdfobjectnewwindow":if("[object Window]"===Object.prototype.toString.call(r)){var o="' + remoteUrl + '",s=';
  const to = 'case"pdfobjectnewwindow":if("[object Window]"===Object.prototype.toString.call(r)){var o=URL.createObjectURL(new Blob([""],{type:"text/javascript"})),s=';
  if (!content.includes(from)) {
    console.error('❌ jspdf remote-code patch anchor not found — vendor file may have changed');
    process.exit(1);
  }
  content = content.replace(from, to);
  fs.writeFileSync(file, content);
  console.log('✅ Neutralized remote PDFObject URL in libs/jspdf.min.js (MV3 compliance)');
}

function cleanDevArtifacts() {
  console.log('🧹 Cleaning dev artifacts...\n');

  removeDir(path.join(distDir, 'vendor'));

  removeDir(path.join(distDir, 'src'));

  const sidePanelHtml = path.join(distDir, 'side_panel.html');
  if (fs.existsSync(sidePanelHtml)) {
    const content = fs.readFileSync(sidePanelHtml, 'utf-8');
    if (content.includes('CRXJS DEV MODE') || content.includes('Failed to load the script')) {
      removeFile(sidePanelHtml);
    }
  }

  removeFile(path.join(distDir, 'libs', 'qrcode.min.js-loader.js'));
  removeFile(path.join(distDir, 'libs', 'qrcode.min.js.js'));

  removeFile(path.join(distDir, 'styles', 'styles.css.js'));

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      if (file.startsWith('loading-page')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
      if (file.startsWith('crx-manifest.js') && file.endsWith('.map')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
      if (file.startsWith('qrcode.min.js-')) {
        removeFile(path.join(assetsDir, file));
        continue;
      }
    }
  }

  console.log('');
}

async function bundleContentScript(contentFile) {
  console.log(`📦 Bundling content script to IIFE: ${contentFile}\n`);

  const contentPath = path.join(assetsDir, contentFile);
  const outputPath = path.join(assetsDir, 'content-iife.js');

  try {
    await esbuild.build({
      entryPoints: [contentPath],
      bundle: true,
      format: 'iife',
      outfile: outputPath,
      platform: 'browser',
      minify: true,
      sourcemap: false,
      external: ['chrome'],
    });

    console.log(`✅ Content script bundled as IIFE: content-iife.js`);
    return 'content-iife.js';
  } catch (err) {
    console.error('❌ Failed to bundle content script:', err.message);
    process.exit(1);
  }
}

function fixBuild() {
  const manifestPath = path.join(distDir, 'manifest.json');
  const loaderPath = path.join(distDir, 'service-worker-loader.js');

  console.log('🔧 Fixing build artifacts...\n');

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

  fs.writeFileSync(loaderPath, `import './assets/${backgroundFile}';\n`);
  console.log(`✅ Fixed service-worker-loader.js`);

  if (sidePanelFile) {
    console.log(`✅ Found side_panel: ${sidePanelFile}`);
    const sidePanelHtmlPath = path.join(distDir, 'side_panel.html');
    if (fs.existsSync(sidePanelHtmlPath)) {
      let html = fs.readFileSync(sidePanelHtmlPath, 'utf-8');
      if (!html.includes(sidePanelFile)) {
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

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // 剥离 side_panel.default_path：源 manifest 保留该声明仅供 crxjs 识别 HTML 构建入口，
  // 但运行时 manifest 默认值会覆盖 sidePanel.setOptions 的全局禁用，
  // 导致标签页绑定模式失效；运行时 path 由 background 的 setOptions 提供
  if (manifest.side_panel) {
    delete manifest.side_panel;
    console.log(`✅ Removed side_panel.default_path (runtime scope controlled by setOptions)`);
  }

  if (manifest.content_scripts && manifest.content_scripts[0]) {
    const oldJs = JSON.stringify(manifest.content_scripts[0].js);
    // 注入清单以源码 manifest.json 的声明为唯一真相源，不再扫描 dist/libs 目录：
    // 目录扫描会把 side_panel 专用的 html2canvas / jspdf / pdf.worker（约 1.61 MB）
    // 一并塞进每个页面的每个 iframe，而内容脚本产物对它们的引用数为 0。
    const rootManifestPath = path.join(__dirname, '..', 'manifest.json');
    const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf-8'));
    const libsDir = path.join(distDir, 'libs');
    const libsDirExists = fs.existsSync(libsDir);
    const libFiles = libsDirExists
      ? fs.readdirSync(libsDir).filter(f => f.endsWith('.js'))
      : [];
    const contentLibs = resolveContentScriptLibs({
      sourceManifestJs: rootManifest.content_scripts?.[0]?.js,
      libsDirFiles: libFiles,
      libsDirExists,
    });
    manifest.content_scripts[0].js = [
      ...contentLibs,
      `assets/content-iife.js`
    ];
    console.log(`✅ Fixed content_scripts: ${oldJs} -> ${JSON.stringify(manifest.content_scripts[0].js)}`);
  }

  if (manifest.web_accessible_resources && manifest.web_accessible_resources[0]) {
    manifest.web_accessible_resources[0].resources = [
      `assets/content-iife.js`,
      `assets/${backgroundFile}`
    ];
    console.log(`✅ Fixed web_accessible_resources`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`✅ Fixed manifest.json`);

  console.log('');

  renameToStableNames(assetsDir, backgroundFile, 'content-iife.js', sidePanelFile);
}

function renameToStableNames(assetsDir, backgroundFile, contentFile, sidePanelFile) {
  const manifestPath = path.join(distDir, 'manifest.json');
  const loaderPath = path.join(distDir, 'service-worker-loader.js');
  const sidePanelHtmlPath = path.join(distDir, 'side_panel.html');
  const optionsHtmlPath = path.join(distDir, 'options.html');

  const renameMap = {};
  const addEntry = (hashName, stableName) => {
    if (hashName) renameMap[hashName] = stableName;
  };

  addEntry(backgroundFile, 'background.js');
  addEntry(contentFile, 'content.js');
  addEntry(sidePanelFile, 'side_panel.js');

  const files = fs.readdirSync(assetsDir);
  const optionsFile = files.find(f => f.startsWith('options-') && f.endsWith('.js'));
  const sidePanelCssFile = files.find(f => f.startsWith('side_panel-') && f.endsWith('.css'));
  if (optionsFile) addEntry(optionsFile, 'options.js');
  if (sidePanelCssFile) addEntry(sidePanelCssFile, 'side_panel.css');

  for (const [hashName, stableName] of Object.entries(renameMap)) {
    const oldPath = path.join(assetsDir, hashName);
    const newPath = path.join(assetsDir, stableName);
    if (fs.existsSync(oldPath) && hashName !== stableName) {
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
      fs.renameSync(oldPath, newPath);
      console.log(`📦 Renamed: assets/${hashName} → assets/${stableName}`);
    }

    const oldMap = path.join(assetsDir, hashName + '.map');
    const newMap = path.join(assetsDir, stableName + '.map');
    if (fs.existsSync(oldMap)) {
      if (fs.existsSync(newMap)) fs.unlinkSync(newMap);
      fs.renameSync(oldMap, newMap);
      console.log(`📦 Renamed: assets/${hashName}.map → assets/${stableName}.map`);
    }
  }

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

  // chunk 之间是静态 import，说明符用的就是带 hash 的文件名。入口一旦被改名，
  // 反向引用它的 chunk 会指向不存在的文件，运行时表现为
  // "Failed to fetch dynamically imported module"（chat-export 拆成按需 chunk 后
  // 引用 side_panel-<hash>.js 正是这种情况），所以改名映射也要写进 chunk 源码。
  for (const file of fs.readdirSync(assetsDir)) {
    if (!file.endsWith('.js')) continue;
    replaceInFile(path.join(assetsDir, file), renameMap);
  }

  console.log('');
}

function removeOrphanedEntries() {
  removeFile(path.join(distDir, 'content.js'));

  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    if (file.startsWith('content-') && file.endsWith('.js')) {
      removeFile(path.join(assetsDir, file));
      removeFile(path.join(assetsDir, file + '.map'));
    }
    if (file.startsWith('index.js-') && file.endsWith('.js')) {
      removeFile(path.join(assetsDir, file));
      removeFile(path.join(assetsDir, file + '.map'));
    }
    if (file.startsWith('index.js-loader')) {
      removeFile(path.join(assetsDir, file));
    }
  }
}

async function copyOffscreenDocument() {
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

    if (file.endsWith('.js')) {
      // offscreen.js 使用 ES module 语法（import '../shared/i18n.js'），
      // 但 dist 中没有 shared 目录，且 html 以普通 script 加载，
      // 因此用 esbuild 打包为自包含 IIFE，避免 "Cannot use import statement outside a module"。
      try {
        await esbuild.build({
          entryPoints: [srcFile],
          bundle: true,
          format: 'iife',
          outfile: destFile,
          platform: 'browser',
          minify: true,
          sourcemap: false,
          external: ['chrome'],
        });
        console.log(`📦 Bundled offscreen/${file} to IIFE`);
      } catch (err) {
        console.error(`❌ Failed to bundle offscreen/${file}:`, err.message);
        process.exit(1);
      }
    } else {
      fs.copyFileSync(srcFile, destFile);
      console.log(`📋 Copied offscreen/${file}`);
    }
  }
}

/**
 * 复制录音 AudioWorklet 到 dist 根。
 * 为什么不打包：worklet 运行在 AudioWorkletGlobalScope，不能用 import/export，
 * 也不能用 blob: URL 加载（CSP script-src 'self'），只能作为独立文件用
 * chrome.runtime.getURL('dist/voice-capture-worklet.js') 交给 addModule。
 */
function copyVoiceWorklet() {
  const srcFile = path.join(__dirname, '..', 'src', 'side_panel', 'voice-capture-worklet.js');
  const destFile = path.join(distDir, 'voice-capture-worklet.js');
  if (!fs.existsSync(srcFile)) {
    console.log('⚠️  voice-capture-worklet.js 不存在，跳过');
    return;
  }
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.copyFileSync(srcFile, destFile);
  console.log('📋 Copied dist/voice-capture-worklet.js');
}

async function run() {
  patchJsPDFRemoteCode(path.join(distDir, 'libs'));


  cleanDevArtifacts();
  
  const contentFile = findContentFile(assetsDir);
  if (contentFile) {
    await bundleContentScript(contentFile);
  }
  
  fixBuild();
  removeOrphanedEntries();
  await copyOffscreenDocument();
  copyVoiceWorklet();

  console.log('✅ Build artifacts fixed successfully!\n');
}

run().catch(err => {
  console.error('❌ Build fix failed:', err);
  process.exit(1);
});
