import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import './custom.css';

// 不在这里静态 import mermaid：静态导入会把 ~700KB mermaid 核心打进每页预加载的 theme chunk，
// 纯文字页也要下载。改由 Layout.vue 在页面确含 <pre class="mermaid"> 时动态 import（spec §4.4）。
export default { extends: DefaultTheme, Layout };
