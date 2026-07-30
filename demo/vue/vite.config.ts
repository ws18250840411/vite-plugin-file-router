import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    vue(),
    fileRouter({
      framework: 'vue',
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      extensions: ['vue'],
    }),
  ],
})
