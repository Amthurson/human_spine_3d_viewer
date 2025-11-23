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
    include: ['react', 'react-dom', 'three', 'three-stdlib'],
    exclude: [],
  },
  build: {
    // 构建目标
    target: 'es2015',
    
    // 输出目录
    outDir: 'dist',
    
    // 生成 source map（生产环境可关闭以减小体积）
    sourcemap: false,
    
    // 最小化混淆（rolldown-vite 使用默认压缩器）
    minify: true,
    
    // 代码分割配置
    rollupOptions: {
      output: {
        // 手动分包策略
        manualChunks: (id) => {
          // 将 node_modules 中的包分离
          if (id.includes('node_modules')) {
            // Three.js 单独打包（体积较大）
            if (id.includes('three')) {
              return 'three'
            }
            // React 相关库单独打包
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor'
            }
            // 其他第三方库
            return 'vendor'
          }
          
          // 将 WASM 相关文件分离
          if (id.includes('wasm')) {
            return 'wasm'
          }
        },
        
        // 文件命名规则
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // 根据资源类型分类存放
          const name = assetInfo.name || 'asset'
          if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(name)) {
            return 'assets/media/[name]-[hash][extname]'
          }
          if (/\.(png|jpe?g|gif|svg|webp|avif)(\?.*)?$/i.test(name)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(name)) {
            return 'assets/fonts/[name]-[hash][extname]'
          }
          if (/\.wasm(\?.*)?$/i.test(name)) {
            return 'assets/wasm/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
    
    // 块大小警告限制（KB）
    chunkSizeWarningLimit: 1000,
    
    // CSS 代码分割
    cssCodeSplit: true,
    
    // 启用 CSS 压缩
    cssMinify: true,
    
    // 构建时清空输出目录
    emptyOutDir: true,
    
    // 报告压缩后的文件大小
    reportCompressedSize: true,
    
    // 提高构建性能
    assetsInlineLimit: 4096, // 小于 4kb 的资源内联为 base64
  },
  
  // 静态资源处理
  assetsInclude: ['**/*.wasm', '**/*.glb', '**/*.gltf'],
  
  server: {
    host: '0.0.0.0',
    allowedHosts: ['127.0.0.1', 'localhost','59494ug0vv21.vicp.fun'],
    fs: {
      allow: ['..'],
    },
  },
})
