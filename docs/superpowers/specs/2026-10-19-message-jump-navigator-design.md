# 消息跳转（问题列表 + 上一条/下一条）优化方案

- 日期：2026-10-19
- 分支：`youhua-theme`
- 范围：侧边栏左侧「消息跳转」把手、▲▼ 按钮、用户问题列表面板
- 交付档：P0 定位感（§2–§5），原列 P1/P2 的键盘可达/搜索/时间戳/边界反馈/附件预览已在**二期**全部落地（见 §7）；§4「本期不做」表保留作决策留痕

## 1. 背景与用户反馈

用户反馈原话：「你看这个用户问题导航列表，包括可以点击上一个下一个，还有直接点击问题列表定位到具体问题，这一块有没有优化空间呢？」附截图显示编号 1-10 的问题列表悬浮压在聊天正文上。

首轮改动完成后追加反馈：「问题列表的 Header 部分不要随着垂直滚动条滚动，Header 要固定可见。」（见 §2.6）

核查代码后确认的问题（实现见 `src/side_panel/index.js` 跳转区块、`side_panel.html` 把手与面板 DOM、`src/side_panel/styles.css` 的 `chat-nav-*` 规则）：

| # | 现象 | 根因 |
|---|------|------|
| 1 | 列表没有任何「当前在哪」的提示 | 条目只渲染序号，从不判定当前视口对应的消息；面板头部只显示总数 |
| 2 | 列表编号与 ▲▼ 跳到的位置对不上 | `jumpToMessage` 遍历 `user + assistant + context-bubble` 混合列表，而问题列表只遍历 `.message.user`，两套口径 |
| 3 | 列表一长就没法读 | 鼠标移出 200ms 即收起，无钉住手段；点击条目后面板继续挡着正文 |
| 4 | 列表下文字透出来、糊成一片 | 面板底色 `rgba(--surface-rgb, 0.78)` + `backdrop-filter`，暗色更明显 |
| 5 | 长问题只显示十几个字 | JS 先按 40 字截断，CSS 又 `white-space:nowrap + ellipsis`，280px 宽再截一刀 |
| 6 | 把手标题中文硬编码 | `side_panel.html` 上 `title="消息跳转"` 未走 `data-i18n-title` |
| 7 | 死代码 | `.chat-nav-question-empty` 规则无任何渲染点产出该节点 |
| 8 | 追加反馈：条目一滚，Header 就被顶出面板 | 面板自身是滚动容器（`max-height` + `overflow-y:auto`），Header 属于滚动内容而非固定区 |

## 2. 设计决策

### 2.1 统一口径：以「问答组」为跳转与列表的唯一单位

新增纯函数落在 `src/side_panel/utils.js`（与既有 `clampPanelToViewport` 同处，DOM 助手本来就住这里，不新建模块）：

- `buildMessageJumpGroups(container)`：一次提问 + 其后所有回答为一组；第一条提问之前的内容并入首组（否则那段跳不到）；无提问的历史会话整体作为一组，保证箭头仍可用。返回 `{ start, userElement, elements }`。
- `findActiveGroupIndex(groups, viewportTop, threshold = 10)`：返回第一个底边越过「容器顶 + 阈值」的组；被顶边切掉一半不算当前，避免连按上一条时原地不动。全部滚过上方返回 -1。
- `resolveJumpTarget(groupCount, activeIndex, direction)`：边界返回 `null`（调用方不动作）。
- `formatQuestionPreview(text, maxLength = 40)`：折叠空白 + 截断补省略号，空文本返回空串由调用方决定占位文案。

`jumpToMessage` 与问题列表改为**同一个** `buildMessageJumpGroups` 的结果，编号 N 与按 ▲▼ 落到第 N 组严格对应。`Ctrl/Cmd+点击` 回顶/回底语义不变，回底改为滚到末组最后一条的 `block:'end'`。

### 2.2 当前定位

- `paintActiveQuestion(activeIndex, total)`：给当前组条目 `classList.add('current')`（品牌色文字 + 14% 品牌底 + 左侧 2px 内阴影指示条），头部由「10」改为「3 / 10」，并把当前条目 `scrollIntoView({ block:'nearest' })` 滚进列表可视范围（只滚面板，不动聊天区）。
- 面板展开期间监听 `#chatContainer` 的 `scroll`，`requestAnimationFrame` 节流后重新判定当前组。
- 判定前重建分组；**若组数与已渲染条目数不一致（流式期间新增了提问）就重建列表**，避免高亮错位。
- 面板已展开时再次进入只同步定位、不重建列表，避免钉住阅读时被重新滚动打断。

### 2.3 钉住（pinned）

- 点击把手切换 `pinned`：钉住后 `hideChatNav` 直接 return，鼠标移出不收起；`Esc` 取消钉住并收起；面板头部有「钉住/取消钉住」文案按钮（纯文字，不用图形符号猜测语义）。
- 非钉住状态下点击条目后 `hideChatNav(true)` 立即收起，让位给刚定位到的正文。
- 收起延时从 200ms 放宽到 300ms。

### 2.4 视觉

- 面板改**实色** `var(--bg-surface)`（暗色 `#1e2128`），去掉 `backdrop-filter`；边框 `var(--border-default)`、阴影 `var(--shadow-lg)`；钉住时边框转品牌色提示状态。
- 条目取消 `nowrap`，改 `-webkit-box + -webkit-line-clamp:2` 两行截断，并必须配 `text-overflow: ellipsis`：新版 Chromium（130+）不再只对 button，而是把所有 `-webkit-box` 的 computed 值都转成 `flow-root`，line-clamp 仍压行数但省略号改由 `text-overflow` 决定，缺它则第三行被 `overflow:hidden` 硬切不画省略号（已在 Chromium 151 上用截图取证：不配无省略号、配后行尾出现 CSS 省略号）；宽度 280 → 300px。
- 把手加宽（8 → 10px）并给钉住态高亮，方便点击。
- 删除 `.chat-nav-question-empty` 死规则。

### 2.5 国际化

新增 `chat.navHotzoneTitle` / `navPinLabel` / `navUnpinLabel` / `navPosition`（zh、en 双份），把手改用 `data-i18n-title`。

### 2.6 Header 固定（追加需求）

用户反馈：条目一滚，「问题列表 / 钉住 / 2 ／ 10」整行跟着被推走。根因是结构问题——面板自身是滚动容器，Header 属于滚动内容。

- 面板改为纵向 flex：`display:flex; flex-direction:column; overflow:hidden`，自身不再滚动；Header `flex:none` 不参与压缩；条目收进新增的 `.chat-nav-question-list`（`flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain`）里滚动。`min-height:0` 必需，否则 flex 子项以内容最小高度为下限，滚动条永远不出现；flex-basis 必须是 `auto` 不能是 `0`——真实产品面板只有 `max-height:62vh` 没有显式 height，auto 高度的纵向 flex 容器按子项假设主轴尺寸定高，basis 0 会让列表对面板高度贡献 0、整个列表塌成 0 高只剩 Header（首版写 `1 1 0` 实机复现过；旧 e2e 给面板内联了固定高所以漏测，已补真实约束回归例并对 `1 1 0` 变异验证转红）。
- 列表 HTML 从 `index.js` 的内联模板提取为 `utils.js` 的 `renderQuestionListHtml(groups, activeIndex, isPinned)`：既让 DOM 只有一处来源，也让真实浏览器测试可以直接驱动产品级标记，而不是抄一份会漂移的副本。
- 转义由 `escapeHtml` 换成仓库既有的 `escapeAttr`：前者借 `document` 实现（node 环境不可用），且不转义 `"`；条目文案取自用户提问，一个引号就能破坏 `title` 与 `data-message-id` 属性。
- 附带滚动条样式收窄（6px、`rgba(--overlay-rgb,.22)`），避免出现粗系统滚动条。

### 2.7 快捷键与提示文案同步（追加需求）

用户反馈：快捷键表里还写着「跳转到上一条消息」，而现在跳的是问答组，不再是逐条消息。

- 口径统一为「问题」：`shortcuts.gotoPrev`/`gotoNext` → 「跳转到上一个/下一个问题」，`chat.navPrevTitle`/`navNextTitle`（▲▼ tooltip）→ 「上一个/下一个问题 (Alt+↑/↓)…」，en 侧对应 `previous/next question`。
- `side_panel.html` 里 ▲▼ 的行内 `title` 兜底与快捷键表 `<td>` 文本同步（这些是 i18n 应用前的默认显示，留着旧说法会在切换语言前露出来）。
- 使用手册 `docs/zh|en/DOCUMENTATION.md` 与仓库 wiki `.wiki/Configuration(-EN).md` 的 `Alt+↑/↓` 行同步改口径。后者是生成物，但已入库且对外可见，重跑 RepoWiki 前它就是用户看到的说明。
- 删除 `shortcuts.prevMessage`/`nextMessage` 两个死键：全仓无引用，且与 `gotoPrev`/`gotoNext` 值重复、说法过时，留着只会被再次误用。
- 未改：把手 tooltip 仍叫「消息跳转」——它是这个入口的功能名（含 Ctrl/Cmd 回顶/到底），CSS 类名与注释也沿用该命名，改成「问题跳转」反而割裂。

## 3. 行为契约

1. 列表第 N 条 = 按 N-1 次「下一条」从顶部到达的组；点击第 N 条滚到该组提问所在位置并高亮 2s。
2. 面板展开时始终有一个条目处于 `current`（除非所有消息都已滚到视口上方，此时头部只显示总数、无高亮）。
3. 钉住状态下：鼠标移出、点击条目都不收起；`Esc` 退出钉住。
4. 面板底色 alpha = 1，暗色与浅色均不透出正文。
5. 无提问的历史会话（纯助手输出）箭头仍可逐段跳转。
6. 条目列表垂直滚动时 Header 位置不变、始终可见；滚动只发生在 `.chat-nav-question-list` 内，面板自身 `scrollTop` 恒为 0。
7. 条目文案含 `"`、`<` 等字符时只作为文本显示，不破坏属性标记。
8. 所有面向用户的上下跳转说明（快捷键表、▲▼ tooltip、使用手册）都用「上一个/下一个问题」，不出现「上一条/下一条消息」。

## 4. 本期不做（已评估，留待后续）

> 下表中除首行「抽出独立模块」外，其余三项均已在**二期**落地（见 §7），保留本表仅作决策留痕。

| 项 | 为什么不做（一期口径） | 二期状态 |
|----|------------|------|
| 抽出 `message-jump-panel.js` 模块 | 分组/定位/列表渲染（`renderQuestionListHtml`）已全部沉到 `utils.js` 可直接单测，剩下的是 `index.js` 里的小段接线；再搬只增加回归面 | ✅ 二期为让 e2e 真实驱动，把接线抽为 `message-jump-nav.js` |
| 键盘可达（把手改可聚焦 button、`:focus-within` 展开） | 牵动 `index.js` 全局快捷键链路，改动面大于收益，单独一期做 | ✅ 二期 A1 已交付 |
| 列表搜索/过滤 | 只有几十条提问时才需要，且与键盘导航绑定更顺 | ✅ 二期 B6 已交付 |
| 条目显示时间戳、边界无动作的反馈、图片消息显示文件名 | P2，一行级但独立 | ✅ 二期 B4/A3/B5 已交付 |

## 5. 验证

- **单测**（`test/unit/message-jump-navigator.unit.test.js`，57 例，TDD 先红后绿）：分组/定位/边界/预览文案/`renderQuestionListHtml` 结构（Header 在滚动区之外、条目在其内、`current` 类、位置文案、钉住态、属性转义）为真实函数断言；面板接线（同一口径、`data-message-id` 定位、当前项高亮、跟随滚动、组数变化重建、钉住、Esc、实色样式、两行截断、面板不滚动、列表区 `min-height:0`、Header `flex:none`、i18n 双语齐备、上下跳转文案改「问题」且旧「消息」说法与死键已清除、zh/en 手册同步）为源码守卫断言。对「组数变化重建」与「属性转义」做过变异验证（分别把判定改成恒假、去掉 `"` 的替换后，两个用例确实转红）。
- **真实浏览器 e2e**（`test/e2e/message-jump.e2e.spec.js`，10 例，Chromium）：加载真实 `theme.css` + `styles.css`，面板内容由真实的 `NavKit.renderQuestionListHtml` 生成（不手写副本），用真实 `getBoundingClientRect` 与 `scrollIntoView` 证明「按编号跳转后反查当前组得到同一编号」，并断言面板底色 alpha=1、暗色下底色为 `rgb(30,33,40)`、高亮态颜色/底色/指示条生效（条目有 color/background 过渡，取值前等待动画结束）、列表 `scrollTop` 增大时 Header 的 `top` 不变且面板 `scrollTop` 恒为 0。Header 用例会先断言滚动区真的可滚（`scrollHeight > clientHeight`）以防空跑；把面板 CSS 改回 `display:block; overflow-y:auto` 后该用例确实转红。两行截断例量真实渲染结果：display 断言兼容新旧引擎（`-webkit-box` / `flow-root`），并断言 `text-overflow: ellipsis` 生效、渲染高度恰为整数行（overflow 后不藏被切一半的第三行）、文字本身不含 JS 截断的省略号。塌高回归例不给面板内联高度（还原真实的 `max-height:62vh` 约束）：断言列表区高度 > 0、面板被 62vh 封顶、超长内容在列表区内滚且 Header 不动、面板 `scrollTop` 恒为 0；把 `flex:1 1 auto` 改回 `1 1 0` 后该例确实转红。
- **主题门**：`theme:contrast` 未达标 0 项，`theme:check` 退出 0。
- **构建**：`npm run build:silent` → `BUILD_SUCCESS`。
- **全量单测**：136 文件 / 2038 例通过；全量 e2e 48 例通过。

> 二期后口径刷新：`message-jump-navigator.unit.test.js` 57→87 例、新增 `message-jump-interaction.e2e.spec.js` 9 例、全量单测 2038→2072 例、全量 e2e 48→58 例（详见 §7）。

## 6. 已知缺口（如实记录）

> ✅ 本缺口已由**二期**关闭（见 §7）：接线抽出为 `message-jump-nav.js` 可导入模块，并用 `message-jump-interaction.e2e.spec.js` 以真实鼠标/键盘驱动悬停展开、点击钉住、Esc 收起。

一期时悬停展开、点击钉住、Esc 收起这三段接线在 `index.js` 的初始化闭包内，未导出，因此**没有**在真实浏览器里用鼠标驱动验证，只有源码守卫断言 + CSS 层的真实渲染断言。

## 7. 二期（A/B/C 全量落地）

一期交付后盘点「还有优化空间吗」，按 A/B/C 三档落地以下项（均在 2026-10-19 同日完成，CHANGELOG 见「消息跳转 · 二期」）：

- **接线抽模块**：新增 `src/side_panel/message-jump-nav.js`，导出 `initMessageJumpNav()` 返回 `{ jumpToMessage, updateActiveQuestion, handleEscape, isPinned }`；`index.js` 只留 `const navApi = initMessageJumpNav();` 与 `Esc`/`Alt+↑↓` 两个转发分支。抽模块的直接目的是让 e2e 能用 esbuild 把真实模块打成 IIFE（`globalName:'NavKit'`），以真鼠标/键盘驱动产品代码，关闭 §6 缺口。
- **A1 键盘可达**：把手补 `role=button tabindex=0 aria-pressed`；聚焦即展开、`↑/↓/Home/End` 条目间移动、`Enter/Space` 钉住、`Esc` 收起；`:focus-visible` 品牌描边。
- **A3 边界反馈**：`jumpToMessage` 返回 `'jumped'|'blocked'|'noop'`，到顶/到底时 `flashNavBlocked` 给 ▲▼ 播 `chatNavShake` 抖动（`prefers-reduced-motion` 降为静态 ring）。
- **B4 提问时间**（`formatNavTime`：当天 `HH:MM`、跨天 `M-D`）、**B5 附件预览**（`getQuestionPreview`：首个文件名/多附 `+N`/「N 张图片」）、**B6 搜索过滤**（`filterJumpGroups` 保留原始组序，≥`NAV_SEARCH_MIN_GROUPS(6)` 渲染搜索框，无命中显空态）。
- **二期反馈修正（用户实测）**：（a）时间从「问题下方一行」改到**右侧独立列**——`.chat-nav-question-item` 改横向 flex，文本 `flex:1 1 auto; min-width:0` 两行截断、时间 `flex:none; white-space:nowrap` 与首行同基线；不选「浮在文字上方」是因为会与 line-clamp 争位、遮挡正文。（b）**中文输入法修复**：搜索框原本每个 `input` 都整体重建 `innerHTML`，拼音上屏前的组合期 `input`（`isComposing=true`）会销毁正在组合的 input → 拼音转不出汉字只剩字母；改为组合期短路、`compositionend` 提交后才过滤（加 `navQuery` 同值早退）。（c）**折行对齐修复**：序号原本内联在被 clamp 的正文节点内部，长提问折行的第二行会回退到 x=0、顶到序号下方；把序号提为正文的 flex 兄弟列（`.idx{flex:none;min-width:14px}`）、条目 `align-items:baseline`，第二行自然与第一行左对齐（§2.4 旧的「序号必须内联于 clamp 节点」前提在条目改为 flex 后不再成立）。（d）**列表“跟随当前项”的双向冲突修正**：`paintActiveQuestion` 原本每次重绘无条件 `activeItem.scrollIntoView({ block:'nearest' })`。（一）钉住后用户手动滚列表去点远处条目时，因对话未滚、当前项仍旧，任一次面板 `mouseenter`/chat scroll 重绘都把列表拽回旧当前项、目标从指针底下移走（“跳动/点不中/跳回上一个”）。（二）但首版用“指针或焦点在面板内”（`userInPanel`）作为屏蔽条件过宽：点过条目后焦点滞留在条目上（面板内），导致之后鼠标移到对话区滚对话时“高亮会跟但列表不滚”、当前项不露出。最终只看 `pointerInPanel`（面板 `mouseenter/leave`）：指针在列表上时不拽，移到对话区时（`mouseleave` 已清标志）正常跟随露出当前项；显式禁止掺入“焦点在面板内”判定。
- **C7/C8/C9**：删孤儿键 `chat.navEmptyLabel`；当前条目补 `aria-current`；`.kb-bubble-hit-text` 与记忆条目两处既有 `line-clamp` 补 `text-overflow:ellipsis`。
- **修复「收起即弹回」真 bug**：`Esc`/点击条目收起时把焦点交回把手，会触发把手 `focus→showChatNav` 重展开；`hideChatNav` 的 `navContainsFocus` 守卫又使点击条目后根本收不起。新增 `suppressFocusExpand` 标志位 + `collapseChatNavReturningFocus()`，`focus` 监听先判抑制位。由二期 `Esc` e2e 用例暴露。
- **验证**：单测 57→87（新增 `formatNavTime`/`getQuestionPreview`/`filterJumpGroups`/`renderQuestionListHtml(query)` 纯函数例、键盘可达/`blocked` 守卫、`index.js` 集成守卫、IME 组合期不重建、时间右列 flex 与序号独立列（正文不再内嵌序号）守卫、列表跟随只看 `pointerInPanel`（含“不得掺入焦点判定”负向断言）与 `pointerInPanel` 接线守卫；「删空态死样式」例翻转为「空态样式存在且被 utils 引用」）+ 新建 `message-jump-interaction.e2e.spec.js` 9 例（含真 `CompositionEvent`/`InputEvent(isComposing)` 驱动验证中文上屏、钉住后手动滚列表不被“跟随当前项”拽回、点击条目后移开鼠标滚对话当前项仍露出）+ `message-jump.e2e.spec.js` 新增用 `Range.getClientRects` 量行盒证明折行第二行与首行左对齐；全量单测 136 文件 / 2072 例、全量 e2e 58 例、`build:silent`、`eslint`(src+test) 0、`theme:check`/`theme:contrast` 通过。
