import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  // MANDATE 0.0.0: Ensures relative paths for Tauri/Electron assets
  base: './', 
  resolve: {
    alias: {
      // MANDATE 0.1.0: Maps '@' to 'src' directory
      // Using path.join with __dirname ensures the absolute path is correct 
      // regardless of the environment (Local vs Sandbox)
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Add specific HMR (Hot Module Replacement) settings for sandboxed environments
    hmr: {
      overlay: false
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});