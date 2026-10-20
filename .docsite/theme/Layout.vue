<script setup>
import DefaultTheme from 'vitepress/theme';
import { watch, onMounted, nextTick } from 'vue';
import { useRoute } from 'vitepress';
import mermaid from 'mermaid';
import DocSearch from './DocSearch.vue';

const { Layout } = DefaultTheme;
const route = useRoute();

async function renderMermaid() {
  if (typeof document === 'undefined') return;
  const els = document.querySelectorAll('pre.mermaid:not([data-processed])');
  if (els.length) {
    try { await mermaid.run({ nodes: els }); } catch (e) { console.warn('mermaid render failed', e); }
  }
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
