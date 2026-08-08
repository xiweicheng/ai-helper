# 为什么用 Vanilla JS 开发浏览器扩展

> 本文来自 AI Helper 项目的真实工程实践。AI Helper 是一个开源的 Chrome 智能助手扩展，采用 ReAct 推理循环架构，内置 44 个工具 + MCP 动态扩展，MIT 许可证。

## 一个反常识的选择

做浏览器扩展，很多人第一反应是上 React 或 Vue。确实，框架提供了组件化、虚拟 DOM、响应式状态管理这些好东西。但 AI Helper 从第一行代码开始，就选择了最朴素的 Vanilla JS——没有框架，没有虚拟 DOM，连状态管理都是手写的。

这不是因为不熟悉框架，而是在浏览器扩展这个特殊场景下反复权衡后的结论。下面聊聊具体的考量。

## 原因一：扩展体积，越小越好

Chrome 扩展的加载体验和网页不同——用户点击图标，期望面板秒开。React + ReactDOM 的生产包大约 130KB（gzip 后约 42KB），Vue 3 也差不多。对于功能丰富的扩展来说，框架运行时本身就是一笔不可忽视的固定开销。

Vanilla JS 没有运行时。Vite 打包后，AI Helper 的 side panel 主 bundle（side_panel.js）包含了多会话管理、Markdown/Mermaid 渲染、Token 统计、执行日志等全部 UI 逻辑，不需要额外引入任何框架的虚拟 DOM diff 引擎。加载更快，内存占用更低。

## 原因二：Manifest V3 的 Service Worker 特性

Manifest V3 的核心变化是 Background Service Worker。它和普通的 Node.js 进程不一样——**Chrome 会在空闲时把 SW 挂起，有事件时再唤醒**。这意味着 SW 的生命周期是碎片化的，你没法依赖一个长期存活的对象图。

React 的优势之一是虚拟 DOM diff——你声明状态，框架帮你高效更新 DOM。但在 SW 环境里，没有 DOM 可以 diff（SW 里没有 document），虚拟 DOM 的优势直接归零。如果用 React，你只是在 Background 里白白引入了一堆不产生价值的代码。

AI Helper 的 Background SW 负责的是 ReAct 推理引擎、工具调度、流式控制这些纯逻辑工作。用 Vanilla JS 写这些逻辑，代码直接、可调试，没有框架抽象层的隔阂。

## 原因三：自研状态管理——双导出 Proxy 模式

不用框架，最大的挑战是状态管理。Redux 太重，Zustand 又是给 React 设计的。AI Helper 需要的是：**所有模块共享同一份响应式状态，80+ 字段，支持两种导入方式**。

最终实现了一个"双导出 Proxy 模式"。核心思路是：用 `export let` 导出命名绑定，再用 `export default` 导出一个通过 getter/setter 代理到同名变量的对象。这样两种 import 方式操作的是同一份数据。

```js
// state.js - 全局状态变量
export let messageHistory = [];
export let currentModel = 'deepseek-v4-pro';
export let activeSessionId = null;
export let sessions = [];
// ... 80+ 个状态字段

// default 导出：通过 getter/setter 代理到同名 let 变量
export default {
  get messageHistory() { return messageHistory; },
  set messageHistory(v) { messageHistory = v; },
  get currentModel() { return currentModel; },
  set currentModel(v) { currentModel = v; },
  // ...
};
```

两种使用方式，同一个数据源：

```js
// 方式 A：整体导入，点号访问
import state from './state.js';
state.messageHistory = newMessages;
console.log(state.currentModel);

// 方式 B：按需解构，直接引用
import { messageHistory } from './state.js';
console.log(messageHistory); // 拿到的是当前值
```

这里有个 ES Module 的细节：`import { messageHistory }` 拿到的是**绑定（live binding）**而非值拷贝，所以当 `state.messageHistory = newArr` 执行后（底层赋值给 `let messageHistory`），通过命名导入引用的代码也能看到最新值。这个特性是双导出 Proxy 模式成立的根基。

这个方案的好处是：零依赖、全模块共享、支持按需导入减少打包体积，而且比 Redux 的 action/reducer/dispatch 流程简单得多。

## 原因四：Content Script 注入零冲突

Content Script 是注入到用户网页中的脚本。如果用 React，你需要处理 ReactDOM.render 的挂载点隔离、CSS 样式泄漏、与页面已有框架的版本冲突等一系列问题。

Vanilla JS 在这方面天然干净。AI Helper 的 Content Script 使用 Shadow DOM 隔离划词工具栏的样式，DOM 操作直接、可控，注入页面后不会与页面已有的任何框架产生冲突。

```js
// Content Script 消息路由：Map 实现 O(1) 查找
const messageHandlers = new Map();
messageHandlers.set('extractPageContent', handleExtract);
messageHandlers.set('fillForm', handleFillForm);
// 收到消息时直接 O(1) 路由
const handler = messageHandlers.get(message.type);
```

没有框架中间层，消息路由就是一个 Map 查找，性能和可读性都很好。

## 代价：得自己干框架的活

选 Vanilla JS 不是没有代价：

- **没有组件化**——UI 更新靠手动 DOM 操作，写多了容易乱。AI Helper 的做法是把每个 UI 面板拆成独立模块（如 `chat-manager.js`、`session-manager.js`、`token-stats-panel.js`），模块内自行管理自己的 DOM 片段。
- **手动事件绑定**——需要自己管理事件监听器的添加和移除，防止内存泄漏。
- **没有热更新生态**——React 有 React DevTools，Vanilla JS 调试全靠断点和 console.log。

但这些代价在浏览器扩展的场景下是可接受的。扩展的 UI 复杂度远不如一个完整的 SPA 应用，模块拆分够用就行。

## 总结

不是 Vanilla JS 更好，而是在浏览器扩展这个场景下它更合适。Manifest V3 的 SW 生命周期让框架的虚拟 DOM 优势大打折扣，Content Script 的注入隔离需求让无框架方案更干净，而自研的双导出 Proxy 模式用不到 100 行代码解决了全局状态管理问题。

当你的运行环境本身就是一个受限的沙箱时，轻量往往就是最好的架构选择。

---

**项目地址：**
- GitHub: https://github.com/xiweicheng/ai-helper
- Gitee: https://gitee.com/xiweicheng/ai-helper
