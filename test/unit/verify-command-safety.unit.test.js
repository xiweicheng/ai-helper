import { describe, it, expect } from 'vitest';
import { isReadOnlyVerifyCommand, shQuoteArg } from '../../src/shared/verify-command-safety.js';

describe('isReadOnlyVerifyCommand - 只读白名单', () => {
  it('放行常见只读探测命令', () => {
    expect(isReadOnlyVerifyCommand('test -e /tmp/a')).toBe(true);
    expect(isReadOnlyVerifyCommand('test ! -e /tmp/a')).toBe(true);
    expect(isReadOnlyVerifyCommand('grep -qF -- needle /tmp/a')).toBe(true);
    expect(isReadOnlyVerifyCommand('ls -la /tmp')).toBe(true);
    expect(isReadOnlyVerifyCommand('cat /tmp/a')).toBe(true);
    expect(isReadOnlyVerifyCommand('/usr/bin/stat /tmp/a')).toBe(true); // basename 归一
  });

  it('放行管道/顺序组合，只要每段首 token 均只读', () => {
    expect(isReadOnlyVerifyCommand('cat a | wc -l')).toBe(true);
    expect(isReadOnlyVerifyCommand('ls /tmp && test -e /tmp/a')).toBe(true);
    expect(isReadOnlyVerifyCommand('grep foo a || true')).toBe(false); // true 不在白名单 → 拒（保守）
  });
});

describe('isReadOnlyVerifyCommand - 拒绝写/执行/注入构造', () => {
  it('拒绝非只读二进制（跑测试/构建）', () => {
    expect(isReadOnlyVerifyCommand('pytest')).toBe(false);
    expect(isReadOnlyVerifyCommand('npm test')).toBe(false);
    expect(isReadOnlyVerifyCommand('make build')).toBe(false);
    expect(isReadOnlyVerifyCommand('rm -rf /tmp/x')).toBe(false);
  });

  it('拒绝重定向（读写）', () => {
    expect(isReadOnlyVerifyCommand('ls > /tmp/out')).toBe(false);
    expect(isReadOnlyVerifyCommand('cat a >> b')).toBe(false);
    expect(isReadOnlyVerifyCommand('sort < input')).toBe(false);
    expect(isReadOnlyVerifyCommand('diff <(ls) <(ls)')).toBe(false);
  });

  it('拒绝命令替换 / 反引号 / 分号 / 换行 / 裸后台', () => {
    expect(isReadOnlyVerifyCommand('echo $(rm -rf /)')).toBe(false);
    expect(isReadOnlyVerifyCommand('cat `whoami`')).toBe(false);
    expect(isReadOnlyVerifyCommand('ls; rm -rf /')).toBe(false);
    expect(isReadOnlyVerifyCommand('ls\nrm x')).toBe(false);
    expect(isReadOnlyVerifyCommand('sleep 100 &')).toBe(false);
  });

  it('拒绝包装/解释器前缀藏匿', () => {
    expect(isReadOnlyVerifyCommand('sudo ls')).toBe(false);
    expect(isReadOnlyVerifyCommand('sh -c "rm -rf /"')).toBe(false);
    expect(isReadOnlyVerifyCommand('env grep x f')).toBe(false);
    expect(isReadOnlyVerifyCommand('find / -name x | xargs rm')).toBe(false);
    expect(isReadOnlyVerifyCommand('python -c "import os"')).toBe(false);
  });

  it('拒绝只读二进制的写/执行参数', () => {
    expect(isReadOnlyVerifyCommand('find / -name x -delete')).toBe(false);
    expect(isReadOnlyVerifyCommand('find / -exec rm {} \\;')).toBe(false);
    expect(isReadOnlyVerifyCommand('sort a -o b')).toBe(false);
  });

  it('拒绝空/非字符串输入', () => {
    expect(isReadOnlyVerifyCommand('')).toBe(false);
    expect(isReadOnlyVerifyCommand('   ')).toBe(false);
    expect(isReadOnlyVerifyCommand(null)).toBe(false);
    expect(isReadOnlyVerifyCommand(undefined)).toBe(false);
    expect(isReadOnlyVerifyCommand(123)).toBe(false);
  });
});

describe('shQuoteArg - 参数转义', () => {
  it('普通值加单引号', () => {
    expect(shQuoteArg('/tmp/a.txt')).toBe("'/tmp/a.txt'");
  });

  it('内部单引号转义为 单引号对', () => {
    expect(shQuoteArg("it's")).toBe("'it'\\''s'");
  });

  it('危险字面量在单引号内被中和（仍返回带引号串）', () => {
    expect(shQuoteArg('a; rm -rf /')).toBe("'a; rm -rf /'");
    expect(shQuoteArg('$(whoami)')).toBe("'$(whoami)'");
  });

  it('含控制字符返回 null（拒绝拼接）', () => {
    expect(shQuoteArg('a\nb')).toBeNull();
    expect(shQuoteArg('a\rb')).toBeNull();
    expect(shQuoteArg('a\u0000b')).toBeNull();
  });

  it('非字符串返回 null', () => {
    expect(shQuoteArg(123)).toBeNull();
    expect(shQuoteArg(null)).toBeNull();
  });
});
