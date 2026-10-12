/**
 * Chrome Web Store packaging script
 *
 * 1. Runs the silent build (npm run build:silent)
 * 2. Validates the output: manifest.json at dist root, default_locale declared,
 *    matching _locales/<locale>/messages.json present, and every __MSG_key__
 *    referenced by the manifest exists in the default locale messages.
 * 3. Cleans macOS junk (.DS_Store) and rebuilds a store-ready zip whose root is
 *    the extension files themselves (manifest.json at zip root), NOT a dist/ folder.
 *
 * Output: ai-helper@<version>.zip in the project root.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// Collect every "key" in a __MSG_key__ placeholder used anywhere in the manifest
function collectMsgKeys(obj, acc = new Set()) {
  const re = /__MSG_([A-Za-z0-9_]+)__/g;
  const walk = (value) => {
    if (typeof value === 'string') {
      let m;
      while ((m = re.exec(value)) !== null) acc.add(m[1]);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  walk(obj);
  return acc;
}

function removeJunk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === '.DS_Store') {
      fs.unlinkSync(full);
      continue;
    }
    if (entry.isDirectory()) removeJunk(full);
  }
}

function main() {
  const pkg = readJson(path.join(projectRoot, 'package.json'));

  console.log('🔨 Building extension (silent)...\n');
  try {
    execFileSync('npm', ['run', 'build:silent'], { cwd: projectRoot, stdio: 'inherit' });
  } catch {
    fail('Build failed. Fix build errors before packaging.');
  }

  const manifestPath = path.join(distDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail('dist/manifest.json not found after build.');
  const manifest = readJson(manifestPath);

  console.log('\n🔎 Validating package...\n');

  if (!manifest.default_locale) fail('manifest.json is missing "default_locale".');

  const defaultLocaleDir = path.join(distDir, '_locales', manifest.default_locale);
  if (!fs.existsSync(defaultLocaleDir)) {
    fail(`_locales/${manifest.default_locale}/ is missing in dist. ` +
      `default_locale "${manifest.default_locale}" must have a matching messages.json.`);
  }

  const defaultMessages = readJson(path.join(defaultLocaleDir, 'messages.json'));
  const referenced = collectMsgKeys(manifest);
  const missing = [...referenced].filter((key) => !(key in defaultMessages));
  if (missing.length) {
    fail(`Manifest references __MSG_ keys missing from _locales/${manifest.default_locale}/messages.json: ${missing.join(', ')}`);
  }
  console.log(`✅ manifest default_locale "${manifest.default_locale}" matches _locales/ and all __MSG_ keys resolve (${referenced.size} checked)`);

  // Clean junk before zipping so it never enters the archive
  removeJunk(distDir);

  const zipName = `ai-helper@${pkg.version}.zip`;
  const zipPath = path.join(projectRoot, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  console.log(`\n📦 Creating ${zipName} (manifest.json at zip root)...\n`);
  try {
    // -r recursive, -X strip extra attrs (no __MACOSX); run inside dist so paths are relative to root
    execFileSync('zip', ['-r', '-X', zipPath, '.', '-x', '*.DS_Store'], { cwd: distDir, stdio: 'inherit' });
  } catch {
    fail('Failed to create zip. Is the `zip` command available? (macOS/Linux)');
  }

  console.log(`\n✅ Package ready: ${zipPath}`);
  console.log('   Upload this zip to the Chrome Web Store developer dashboard.');
}

main();
