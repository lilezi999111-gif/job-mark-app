import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 构建产物是单个独立 HTML（dist/index.html），双击即可用浏览器打开，无需任何服务
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
