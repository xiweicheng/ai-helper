# 禁止使用浏览器原生模态框

项目中所有弹出框（确认框、提示框、模态框）必须使用自定义 UI 实现，**禁止使用浏览器原生 API**。

## 禁止使用的 API

- `window.confirm()` — 使用 Side Panel 的自定义 `showCustomConfirm()` 替代
- `window.alert()` — 使用自定义通知/提示组件替代
- `window.prompt()` — 使用自定义输入弹窗替代

## 可用的自定义实现

### Side Panel 确认弹窗

```js
// 返回 Promise<boolean>
const confirmed = await showCustomConfirm('确定要执行此操作吗？', '操作确认');
if (confirmed) {
  // 执行操作
}
```

### 新增自定义弹窗的规范

1. 使用 `.modal-overlay` + `.modal-container` 结构（参考已有弹窗）
2. 按钮交互使用事件委托，用后清理监听器
3. 返回 Promise 供调用方 await
4. 模态框只能通过自身提供的关闭按钮（如右上角 X 按钮、取消/确定按钮）关闭，**禁止点击遮罩层（模态框外部区域）关闭弹窗**

## 例外情况

- Content Script 中与页面交互的简单提示可不适用此规则
