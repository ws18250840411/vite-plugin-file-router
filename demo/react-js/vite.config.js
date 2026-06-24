import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import fileRouter from '../../dist/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
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
