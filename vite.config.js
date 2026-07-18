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
        { src: 'icons', dest: '.' }
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
    sourcemap: true,
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
