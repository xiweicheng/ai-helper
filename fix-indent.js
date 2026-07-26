const fs = require('fs');
const path = 'src/background/tool-memory.js';
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');
let inLockBlock = false;
let result = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.trim() === 'return withMemoryLock(async () => {') {
    result.push(line);
    inLockBlock = true;
  } else if (inLockBlock && /^\s{2}\);\s*$/.test(line)) {
    inLockBlock = false;
    result.push(line);
  } else if (inLockBlock) {
    result.push('  ' + line);
  } else {
    result.push(line);
  }
}

fs.writeFileSync(path, result.join('\n'), 'utf8');
console.log('Done');
