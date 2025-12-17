import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Ensures relative paths for assets in Electron
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/binance': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance/, ''),
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});