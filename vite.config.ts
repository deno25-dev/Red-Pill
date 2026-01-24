import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  // Base './' is essential for Tauri and AI Studio preview environments
  base: './',
  // Explicitly set root to current directory
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      // This maps the '@' symbol specifically to your src folder
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: {
      // Allow serving files from one level up to ensure visibility of all project resources
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});