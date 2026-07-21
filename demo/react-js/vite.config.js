import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import fileRouter from '../../dist/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(__dirname, '../../node_modules/.vite-react-js-demo'),
  plugins: [
    react(),
    fileRouter({
      framework: 'react',
      pagesDir: 'src/pages',
      outFile: 'src/routes.js',
      extensions: ['jsx', 'js'],
    }),
  ],
})
