// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getState,
  getActiveProfile,
  ensureProfilesMigrated,
  applyProfile,
  updateActiveProfile,
  syncActiveProfileModels,
  updateActiveProfileModelName,
  createProfile,
  renameProfile,
  deleteProfile,
  stripProfileSecrets,
  mergeProfiles,
  deriveProfileName,
  getHostFromApiBase,
  normalizeModels,
  DEFAULT_API_BASE,
  DEFAULT_MODEL_NAME,
} from '../../src/shared/model-profiles.js';

const LEGACY_ID = 'profile-legacy-default';

// ===== chrome.storage.local 内存 mock =====
let store = {};

function mockStorage(initial = {}) {
  store = { ...initial };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (keys) => {
          const list = Array.isArray(keys) ? keys : Object.keys(store);
          const result = {};
          for (const k of list) {
            if (store[k] !== undefined) result[k] = store[k];
          }
          return Promise.resolve(result);
        },
        set: (obj) => {
          Object.assign(store, obj);
          return Promise.resolve();
        },
      },
    },
  });
}

beforeEach(() => {
  mockStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureProfilesMigrated（迁移）', () => {
  test('无配置时用扁平键 + 预设快照 + customModels 构造初始配置', async () => {
    mockStorage({
      apiBase: 'https://api.moonshot.cn/v1',
      apiKey: 'sk-1',
      modelName: 'kimi-k2',
      customModels: ['kimi-k2', { name: 'deepseek-v4-pro', contextWindow: 128000 }],
    });

    const result = await ensureProfilesMigrated();

    expect(result.migrated).toBe(true);
    expect(result.profiles).toHaveLength(1);
    const profile = result.profiles[0];
    expect(profile.id).toBe(LEGACY_ID);
    expect(profile.name).toBe('Moonshot');
    expect(profile.apiBase).toBe('https://api.moonshot.cn/v1');
    expect(profile.apiKey).toBe('sk-1');
    expect(profile.modelName).toBe('kimi-k2');
    // 预设快照 + 自定义模型合并（预设原有项保留 contextWindow 覆盖）
    expect(profile.models).toEqual([
      { name: 'deepseek-v4-pro', contextWindow: 128000 },
      { name: 'deepseek-v4-flash', contextWindow: 0 },
      { name: 'kimi-k2', contextWindow: 0 },
    ]);
    expect(store.activeProfileId).toBe(LEGACY_ID);
    // 扁平 customModels 已同步为完整列表（投影一致）
    expect(store.customModels).toEqual(profile.models);
  });

  test('消费 deletedPresetModels（被删预设不进入快照）', async () => {
    mockStorage({
      apiBase: 'https://api.openai.com/v1',
      customModels: [{ name: 'gpt-4o', contextWindow: 128000 }],
      deletedPresetModels: ['deepseek-v4-flash'],
    });

    const result = await ensureProfilesMigrated();

    expect(result.profiles[0].name).toBe('OpenAI');
    expect(result.profiles[0].models).toEqual([
      { name: 'deepseek-v4-pro', contextWindow: 0 },
      { name: 'gpt-4o', contextWindow: 128000 },
    ]);
  });

  test('幂等：二次调用不重复创建（migrated=false）', async () => {
    mockStorage({ apiKey: 'k' });

    const first = await ensureProfilesMigrated();
    const second = await ensureProfilesMigrated();

    expect(second.migrated).toBe(false);
    expect(second.profiles).toHaveLength(1);
    expect(second.profiles[0].id).toBe(first.profiles[0].id);
  });

  test('activeProfileId 缺失/失效时修复为第一个', async () => {
    mockStorage({
      modelProfiles: [{ id: 'a', name: 'A', apiBase: DEFAULT_API_BASE, models: [] }],
      activeProfileId: 'missing',
    });

    const result = await ensureProfilesMigrated();

    expect(result.activeProfileId).toBe('a');
    expect(store.activeProfileId).toBe('a');
  });

  test('无扁平键时使用默认地址与模型名', async () => {
    const result = await ensureProfilesMigrated();

    expect(result.profiles[0].apiBase).toBe(DEFAULT_API_BASE);
    expect(result.profiles[0].modelName).toBe(DEFAULT_MODEL_NAME);
  });
});

describe('applyProfile（切换即同步扁平键）', () => {
  test('切换配置把字段写回扁平键并更新 activeProfileId', async () => {
    const p1 = await createProfile({
      name: 'A',
      apiBase: 'https://api.deepseek.com',
      apiKey: 'sk-a',
      modelName: 'm-a',
      models: [{ name: 'm-a', contextWindow: 1000 }],
    });
    await createProfile({
      name: 'B',
      apiBase: 'https://api.openai.com/v1',
      apiKey: 'sk-b',
      modelName: 'm-b',
      models: [{ name: 'm-b', contextWindow: 2000 }],
    });

    const switched = await applyProfile(p1.id);

    expect(switched.id).toBe(p1.id);
    expect(store.apiBase).toBe('https://api.deepseek.com');
    expect(store.apiKey).toBe('sk-a');
    expect(store.modelName).toBe('m-a');
    expect(store.customModels).toEqual([{ name: 'm-a', contextWindow: 1000 }]);
    expect(store.activeProfileId).toBe(p1.id);
  });

  test('未知 id 返回 null 且不改变存储', async () => {
    mockStorage({ apiBase: 'https://api.deepseek.com', apiKey: 'k' });

    const result = await applyProfile('nope');

    expect(result).toBeNull();
    expect(store.apiBase).toBe('https://api.deepseek.com');
    expect(store.activeProfileId).toBeUndefined();
  });
});

describe('updateActiveProfile / 同步函数', () => {
  test('只更新激活项，其他配置不受影响', async () => {
    const p1 = await createProfile({ name: 'A', apiBase: 'https://a.com', models: [] }, { activate: false });
    const p2 = await createProfile({ name: 'B', apiBase: 'https://b.com', models: [] });

    await syncActiveProfileModels([{ name: 'm1', contextWindow: 0 }]);
    await updateActiveProfileModelName('m1');
    await updateActiveProfile({ apiKey: 'sk-new' });

    const a = store.modelProfiles.find(p => p.id === p1.id);
    const b = store.modelProfiles.find(p => p.id === p2.id);
    expect(a.models).toEqual([]);
    expect(a.modelName).toBe(DEFAULT_MODEL_NAME);
    expect(b.models).toEqual([{ name: 'm1', contextWindow: 0 }]);
    expect(b.modelName).toBe('m1');
    expect(b.apiKey).toBe('sk-new');
  });

  test('getActiveProfile 返回激活项', async () => {
    const p = await createProfile({ name: 'A' });

    const active = await getActiveProfile();

    expect(active.id).toBe(p.id);
    const state = await getState();
    expect(state.profiles).toHaveLength(1);
  });
});

describe('deleteProfile（删除保护与自动切换）', () => {
  test('不可删除最后一个配置', async () => {
    const p1 = await createProfile({ name: 'A' });

    const result = await deleteProfile(p1.id);

    expect(result).toMatchObject({ deleted: false, reason: 'last' });
    expect(store.modelProfiles).toHaveLength(1);
  });

  test('删除激活项后自动激活剩余第一个并同步扁平键', async () => {
    const p1 = await createProfile({
      name: 'A',
      apiBase: 'https://a.com',
      apiKey: 'k-a',
      modelName: 'ma',
      models: [{ name: 'ma', contextWindow: 0 }],
    }, { activate: false });
    const p2 = await createProfile({
      name: 'B',
      apiBase: 'https://b.com',
      apiKey: 'k-b',
      modelName: 'mb',
      models: [{ name: 'mb', contextWindow: 0 }],
    });

    const result = await deleteProfile(p2.id);

    expect(result.deleted).toBe(true);
    expect(result.activeProfileId).toBe(p1.id);
    expect(store.activeProfileId).toBe(p1.id);
    expect(store.apiBase).toBe('https://a.com');
    expect(store.apiKey).toBe('k-a');
    expect(store.modelName).toBe('ma');
    expect(store.customModels).toEqual([{ name: 'ma', contextWindow: 0 }]);
  });

  test('删除非激活项不改变扁平键', async () => {
    const p1 = await createProfile({ name: 'A', apiBase: 'https://a.com', models: [] }, { activate: false });
    const p2 = await createProfile({ name: 'B', apiBase: 'https://b.com', models: [] });

    const result = await deleteProfile(p1.id);

    expect(result.deleted).toBe(true);
    expect(result.activeProfileId).toBe(p2.id);
    expect(store.apiBase).toBe('https://b.com');
  });
});

describe('renameProfile', () => {
  test('重命名成功 / 空名与未知 id 返回 false', async () => {
    const p1 = await createProfile({ name: 'A' });

    expect(await renameProfile(p1.id, '  B  ')).toBe(true);
    expect(store.modelProfiles[0].name).toBe('B');
    expect(await renameProfile(p1.id, '   ')).toBe(false);
    expect(await renameProfile('nope', 'C')).toBe(false);
  });
});

describe('stripProfileSecrets', () => {
  test('逐配置剥离 apiKey 且不修改原数组', () => {
    const profiles = [{ id: 'a', name: 'A', apiKey: 'sk-1' }, { id: 'b', name: 'B', apiKey: 'sk-2' }];

    const stripped = stripProfileSecrets(profiles);

    expect(stripped[0].apiKey).toBe('');
    expect(stripped[1].apiKey).toBe('');
    expect(profiles[0].apiKey).toBe('sk-1');
    expect(stripProfileSecrets(null)).toEqual([]);
  });
});

describe('mergeProfiles（导入合并）', () => {
  const local = [
    { id: 'a', name: 'A', apiKey: 'sk-local-a', updatedAt: 100 },
    { id: 'b', name: 'B', apiKey: 'sk-local-b', updatedAt: 200 },
  ];

  test('新 id 追加；同 id 较新覆盖；较旧忽略', () => {
    const merged = mergeProfiles(local, [
      { id: 'b', name: 'B-new', apiKey: 'sk-file-b', updatedAt: 300 },
      { id: 'a', name: 'A-old', apiKey: 'sk-file-a', updatedAt: 50 },
      { id: 'c', name: 'C', apiKey: 'sk-file-c', updatedAt: 10 },
    ]);

    expect(merged.map(p => p.name)).toEqual(['A', 'B-new', 'C']);
    expect(merged.find(p => p.id === 'a').name).toBe('A');
  });

  test('同 id 覆盖时文件 apiKey 为空则继承本机密钥（不含密钥导出）', () => {
    const merged = mergeProfiles(local, [
      { id: 'b', name: 'B-new', apiKey: '', updatedAt: 300 },
    ]);

    expect(merged.find(p => p.id === 'b').apiKey).toBe('sk-local-b');
  });

  test('本机为空白默认配置时不阻挡同 id 导入（新环境迁移场景）', () => {
    const merged = mergeProfiles(
      [{ id: LEGACY_ID, name: 'DeepSeek', apiBase: DEFAULT_API_BASE, apiKey: '', modelName: DEFAULT_MODEL_NAME, updatedAt: 999 }],
      [{ id: LEGACY_ID, name: '我的中转', apiBase: 'https://my.proxy.com/v1', apiKey: 'sk-x', modelName: 'gpt-4o', updatedAt: 10 }],
    );

    expect(merged[0].name).toBe('我的中转');
    expect(merged[0].apiBase).toBe('https://my.proxy.com/v1');
  });

  test('无 id 条目跳过；空/非法输入容错；不修改原数组', () => {
    const merged = mergeProfiles(local, [{ name: 'no-id' }, null]);

    expect(merged).toHaveLength(2);
    expect(mergeProfiles(null, null)).toEqual([]);
    expect(local[0].name).toBe('A');
  });
});

describe('工具函数', () => {
  test('deriveProfileName：预设域名映射与未知域名回退', () => {
    expect(deriveProfileName('https://api.deepseek.com')).toBe('DeepSeek');
    expect(deriveProfileName('https://api.openai.com/v1')).toBe('OpenAI');
    expect(deriveProfileName('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('阿里云百炼');
    expect(deriveProfileName('https://my.proxy.example.com/v1')).toBe('my.proxy.example.com');
    expect(deriveProfileName('')).toBe('');
  });

  test('getHostFromApiBase：合法 URL 与非法输入', () => {
    expect(getHostFromApiBase('https://api.deepseek.com/v1')).toBe('api.deepseek.com');
    expect(getHostFromApiBase('')).toBe('');
  });

  test('normalizeModels：字符串/对象混合与非法项过滤', () => {
    expect(normalizeModels(['a', { name: 'b', contextWindow: 5 }, null, {}, ''])).toEqual([
      { name: 'a', contextWindow: 0 },
      { name: 'b', contextWindow: 5 },
    ]);
    expect(normalizeModels('not-array')).toEqual([]);
  });
});
