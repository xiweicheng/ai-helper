<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const open = ref(false);
let ui = null;
const BASE = '/ai-helper/wiki/';

async function ensureUi() {
  if (ui) return;
  if (!document.querySelector('#pagefind-ui-css')) {
    const link = document.createElement('link');
    link.id = 'pagefind-ui-css'; link.rel = 'stylesheet';
    link.href = `${BASE}pagefind/pagefind-ui.css`;
    document.head.appendChild(link);
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `${BASE}pagefind/pagefind-ui.js`;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  ui = new window.PagefindUI({ element: '#docsearch-mount', bundlePath: `${BASE}pagefind/`, showImages: false });
}

function nextTickFrame() { return new Promise(r => requestAnimationFrame(r)); }
async function toggle() {
  open.value = !open.value;
  if (open.value) { await nextTickFrame(); await ensureUi(); }
}
function onKey(e) { if (e.key === 'Escape') open.value = false; }
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); ui?.destroy?.(); });
</script>

<template>
  <button class="docsearch-btn" @click="toggle" aria-label="搜索文档">🔍 搜索</button>
  <div v-if="open" class="docsearch-overlay" @click.self="open = false">
    <div id="docsearch-mount" class="docsearch-panel"></div>
  </div>
</template>
