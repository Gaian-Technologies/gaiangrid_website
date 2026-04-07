import { defineConfig } from 'vite';

export default defineConfig({
  root: './src',
  cacheDir: '../.vite',
  build: {
    outDir: '../dist',
  },
  server: {
    host: '0.0.0.0',
    port: 8083,
    strictPort: true,
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
