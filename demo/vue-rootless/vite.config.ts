import path from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fileRouter from '../../src/index.ts'

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.resolve(import.meta.dirname, '../../node_modules/.vite-vue-rootless-demo'),
  plugins: [
    vue(),
    fileRouter({
      framework: 'vue',
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    }),
  ],
})
