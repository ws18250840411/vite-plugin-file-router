import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    react(),
    fileRouter({
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    }),
  ],
})
