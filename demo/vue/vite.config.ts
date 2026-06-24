import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import fileRouter from '../../src/index.ts'

/** Strip `<route>` blocks after file-router has read them at scan time. */
function stripVueRouteBlocks(): Plugin {
  return {
    name: 'demo-strip-vue-route-blocks',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('.vue') || !code.includes('<route')) return
      return code.replace(/<route[\s\S]*?<\/route>\s*/i, '')
    },
  }
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    stripVueRouteBlocks(),
    vue(),
    fileRouter({
      framework: 'vue',
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
      extensions: ['vue'],
    }),
  ],
})
