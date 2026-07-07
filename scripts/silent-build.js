import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

try {
  execFileSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  console.log('BUILD_SUCCESS');
} catch (error) {
  console.error(error.stdout?.toString() || '');
  console.error(error.stderr?.toString() || '');
  process.exit(1);
}