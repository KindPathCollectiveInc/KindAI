import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative, not absolute — this build is served from a GitHub Pages
  // project subpath (https://<org>.github.io/KindAI/) in one deployment
  // target and loaded via a local static server with no fixed subpath at
  // all in the Electron build. Relative asset URLs work in both without
  // needing to know the deployment path at build time.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
