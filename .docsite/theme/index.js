import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import mermaid from 'mermaid';
import './custom.css';

if (typeof document !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
}

export default { extends: DefaultTheme, Layout };
