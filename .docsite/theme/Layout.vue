<script setup>
import DefaultTheme from 'vitepress/theme';
import { watch, onMounted, nextTick } from 'vue';
import { useRoute } from 'vitepress';
import DocSearch from './DocSearch.vue';

const { Layout } = DefaultTheme;
const route = useRoute();

// mermaid 按需动态加载：仅当页面含未处理的 <pre class="mermaid"> 时才 import，
// 避免把 mermaid 核心静态打进每页预加载的 theme chunk（spec §4.4）。
let mermaidInstance;
async function renderMermaid() {
  if (typeof document === 'undefined') return;
  const els = document.querySelectorAll('pre.mermaid:not([data-processed])');
  if (!els.length) return;
  if (!mermaidInstance) {
    mermaidInstance = (await import('mermaid')).default;
    mermaidInstance.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
  }
  try { await mermaidInstance.run({ nodes: els }); } catch (e) { console.warn('mermaid render failed', e); }
}
onMounted(() => nextTick(renderMermaid));
watch(() => route.path, () => nextTick(renderMermaid));
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <DocSearch />
    </template>
  </Layout>
</template>
