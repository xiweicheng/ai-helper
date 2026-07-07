# 禁止使用浏览器原生模态框

**核心规则**：所有弹窗必须使用自定义 UI，禁止 `window.confirm()`、`window.alert()`、`window.prompt()`。

## 替代方案

| 原生 API | 替代实现 |
|-----------|---------|
| `window.confirm()` | `showCustomConfirm(title, message)` → `Promise<boolean>` |
| `window.alert()` | 自定义通知/提示组件 |
| `window.prompt()` | 自定义输入弹窗 |

## 自定义弹窗规范

1. DOM 结构：`.modal-overlay` > `.modal-container`
2. 按钮交互：事件委托，用后清理监听器
3. 返回值：返回 Promise 供 `await`
4. **关闭方式**：仅通过弹窗自身按钮关闭（X 按钮、取消、确定），**禁止点击遮罩层关闭**

## 例外

Content Script 中与页面交互的简单提示可不适用此规则。
