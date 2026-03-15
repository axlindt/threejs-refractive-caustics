import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/threejs-refractive-caustics/',
  root: 'playground',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
