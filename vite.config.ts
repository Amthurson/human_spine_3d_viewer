import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
    preserveSymlinks: false,
    conditions: ['import', 'module', 'browser', 'default'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['127.0.0.1', 'localhost','59494ug0vv21.vicp.fun'],
    fs: {
      allow: ['..'],
    },
  },
})
