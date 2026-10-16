import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        { src: 'libs', dest: '.' },
        { src: 'styles', dest: '.' },
        { src: 'icons', dest: '.' },
        { src: '_locales', dest: '.' }
      ]
    })
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
      protocol: 'ws',
      host: 'localhost'
    }
  },
  build: {
    outDir: 'dist',
    // 产物是直装进 Chrome 扩展包的，开 map 等于把源码（含注释）一起发布：
    // 此前 dist 内 16 个 .map 共 10 MB，最大的 side_panel.js.map 4.2 MB（SEC-13）。
    // 调试请看 src（单测与 e2e 都是从 src 现打），不要在这里改回 true
    sourcemap: false,
    rollupOptions: {
      input: {
        background: 'src/background/index.js',
        content: 'src/content/index.js',
        side_panel: 'src/side_panel/index.js',
        options: 'src/options/index.js'
      }
    }
  }
});
