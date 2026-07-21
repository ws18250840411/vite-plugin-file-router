import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fileRouter from '../../src/index.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(__dirname, '../../node_modules/.vite-react-demo'),
  plugins: [
    react(),
    fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    }),
  ],
})
