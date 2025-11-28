// JavaScript version of Vite config
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'host.docker.internal',
      '.docker.internal'
    ],
    hmr: {
      overlay: true,
    },
    watch: {
      // Improve HMR reliability on WSL/VM/docker
      usePolling: true,
      interval: 100,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist/frontend',
  },
  // Specify the entry point as our JavaScript file
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});