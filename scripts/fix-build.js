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

  if (manifest.content_scripts && manifest.content_scripts[0]) {
    const oldJs = JSON.stringify(manifest.content_scripts[0].js);
    const libsDir = path.join(distDir, 'libs');
    const libFiles = fs.existsSync(libsDir) 
      ? fs.readdirSync(libsDir)
          .filter(f => f.endsWith('.js') && f !== 'mermaid.min.js')
          .map(f => `libs/${f}`)
      : [];
    manifest.content_scripts[0].js = [
      ...libFiles,
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

async function run() {
  cleanDevArtifacts();
  
  const contentFile = findContentFile(assetsDir);
  if (contentFile) {
    await bundleContentScript(contentFile);
  }
  
  fixBuild();
  removeOrphanedEntries();
  copyOffscreenDocument();

  console.log('✅ Build artifacts fixed successfully!\n');
}

run().catch(err => {
  console.error('❌ Build fix failed:', err);
  process.exit(1);
});
