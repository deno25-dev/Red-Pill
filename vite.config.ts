import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './', // Mandate 0.0.0: Ensures relative paths for Tauri/Electron assets
  resolve: {
    alias: {
      '@': path.resolve('src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});