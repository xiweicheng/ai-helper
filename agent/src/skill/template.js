// skill/template.js - 模板引擎
// 支持 {{variable}} 变量替换和 {{#if variable}}...{{/if}} 条件渲染

/**
 * 渲染模板字符串，替换所有 {{variable}} 为实际值
 * @param {string} template - 模板字符串
 * @param {Object} variables - 变量映射
 * @returns {string}
 */
export function renderTemplate(template, variables = {}) {
  if (typeof template !== 'string') return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    const trimmed = expr.trim();

    // 处理简单变量: {{name}}
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmed)) {
      const value = resolveVariable(trimmed, variables);
      return value !== undefined ? String(value) : match;
    }

    // 未识别的表达式，保持原样
    return match;
  });
}

/**
 * 递归渲染对象中所有字符串值
 * @param {*} obj - 要渲染的对象
 * @param {Object} variables - 变量映射
 * @returns {*}
 */
export function renderObject(obj, variables = {}) {
  if (typeof obj === 'string') {
    return renderTemplate(obj, variables);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => renderObject(item, variables));
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = renderObject(value, variables);
    }
    return result;
  }
  return obj;
}

/**
 * 解析点号分隔的变量路径: a.b.c
 */
function resolveVariable(path, variables) {
  const parts = path.split('.');
  let current = variables;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * 评估条件表达式
 * 支持: {{#if variable}}...{{/if}}
 * @param {string} template
 * @param {Object} variables
 * @returns {string}
 */
export function renderConditional(template, variables = {}) {
  if (typeof template !== 'string') return template;

  return template.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
    const trimmed = condition.trim();
    // 取反: !variable
    if (trimmed.startsWith('!')) {
      const varName = trimmed.slice(1).trim();
      const value = resolveVariable(varName, variables);
      return !value ? renderTemplate(content, variables) : '';
    }
    // 正常: variable
    const value = resolveVariable(trimmed, variables);
    return value ? renderTemplate(content, variables) : '';
  });
}

/**
 * 完整渲染：先处理条件，再处理变量
 */
export function render(template, variables = {}) {
  if (typeof template !== 'string') return template;
  const afterConditional = renderConditional(template, variables);
  return renderTemplate(afterConditional, variables);
}
