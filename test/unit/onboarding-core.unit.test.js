import { describe, it, expect } from 'vitest';
import {
  DOCS_URL, PROVIDERS, providerById, isModelConfigured,
  shouldAutoShow, pickDefaultModel, classifyFetchError, EXAMPLE_TASKS,
  getProviderShowcase,
} from '../../src/side_panel/onboarding-core.js';

describe('onboarding-core 服务商', () => {
  it('包含八个服务商且 DeepSeek 为推荐项、默认 API Base', () => {
    expect(PROVIDERS).toHaveLength(8);
    const ds = providerById('deepseek');
    expect(ds.apiBase).toBe('https://api.deepseek.com');
    expect(ds.recommended).toBe(true);
  });

  it('未知 id 回退到 DeepSeek', () => {
    expect(providerById('nope').id).toBe('deepseek');
  });

  it('自定义服务商没有预设 apiBase', () => {
    expect(providerById('custom').apiBase).toBe('');
    expect(providerById('custom').needsBase).toBe(true);
  });

  it('Claude 官方协议不兼容，需手填中转 Base', () => {
    expect(providerById('claude').apiBase).toBe('');
    expect(providerById('claude').needsBase).toBe(true);
  });

  it('Gemini 指向 OpenAI 兼容端点', () => {
    expect(providerById('gemini').apiBase).toContain('generativelanguage.googleapis.com');
  });
});

describe('isModelConfigured', () => {
  it('Key 与模型都非空才算已配置', () => {
    expect(isModelConfigured({ apiKey: 'sk-1', modelName: 'm' })).toBe(true);
    expect(isModelConfigured({ apiKey: 'sk-1', modelName: '' })).toBe(false);
    expect(isModelConfigured({ apiKey: '', modelName: 'm' })).toBe(false);
    expect(isModelConfigured({})).toBe(false);
  });

  it('空白字符不算已配置', () => {
    expect(isModelConfigured({ apiKey: '   ', modelName: '  ' })).toBe(false);
  });
});

describe('shouldAutoShow', () => {
  it('未配置且未提示过才自动弹', () => {
    expect(shouldAutoShow({ configured: false, dismissedAt: 0 })).toBe(true);
    expect(shouldAutoShow({ configured: true, dismissedAt: 0 })).toBe(false);
    expect(shouldAutoShow({ configured: false, dismissedAt: 1700000000000 })).toBe(false);
  });
});

describe('pickDefaultModel', () => {
  it('DeepSeek 地址优先 deepseek-v4-pro', () => {
    const models = ['deepseek-chat', 'deepseek-v4-pro', 'deepseek-reasoner'];
    expect(pickDefaultModel(models, 'https://api.deepseek.com')).toBe('deepseek-v4-pro');
  });

  it('DeepSeek 地址没有该模型时取第一个', () => {
    expect(pickDefaultModel(['a', 'b'], 'https://api.deepseek.com')).toBe('a');
  });

  it('非 DeepSeek 地址取第一个；空列表返回空串', () => {
    expect(pickDefaultModel(['qwen-max'], 'https://dashscope.aliyuncs.com')).toBe('qwen-max');
    expect(pickDefaultModel([], 'https://x')).toBe('');
    expect(pickDefaultModel(null, 'https://x')).toBe('');
  });
});

describe('classifyFetchError', () => {
  it('按状态码与原因归类', () => {
    expect(classifyFetchError({ status: 401 })).toBe('auth');
    expect(classifyFetchError({ status: 403 })).toBe('auth');
    expect(classifyFetchError({ reason: 'timeout' })).toBe('timeout');
    expect(classifyFetchError({ reason: 'network' })).toBe('network');
    expect(classifyFetchError({ reason: 'invalid-config' })).toBe('invalidConfig');
    expect(classifyFetchError({ reason: 'parse' })).toBe('noModels');
    expect(classifyFetchError({ status: 500 })).toBe('http');
    expect(classifyFetchError(null)).toBe('http');
  });
});

describe('常量', () => {
  it('文档地址与示例任务', () => {
    expect(DOCS_URL).toBe('https://xiweicheng.github.io/ai-helper/');
    expect(EXAMPLE_TASKS.map(x => x.id)).toEqual(['summary', 'table', 'watch']);
  });
});

describe('getProviderShowcase', () => {
  it('中文环境国内厂商优先，且不展示「其他/自建」', () => {
    expect(getProviderShowcase('zh').map(p => p.id))
      .toEqual(['deepseek', 'qwen', 'kimi', 'doubao', 'openai', 'gemini', 'claude']);
  });

  it('英文环境把国际厂商排到最前', () => {
    const en = getProviderShowcase('en');
    expect(en).toHaveLength(7);
    expect(en.slice(0, 3).map(p => p.id)).toEqual(['openai', 'gemini', 'claude']);
  });
});

describe('onboarding 文案', () => {
  it('中英文都注册了关键文案，且无占位符残留', async () => {
    await import('../../src/side_panel/onboarding-wizard.js');
    const { t, setLanguage, getLanguage } = await import('../../src/shared/i18n.js');
    const original = getLanguage();
    setLanguage('zh', false);
    expect(t('onboarding.step0Title')).not.toBe('onboarding.step0Title');
    expect(t('onboarding.docsIntroLink')).toBe('看看官方介绍');
    setLanguage('en', false);
    expect(t('onboarding.step0Title')).not.toBe('onboarding.step0Title');
    setLanguage(original, false);
  });
});
