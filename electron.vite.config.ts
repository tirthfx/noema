import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/main.ts'),
          'phase1-smoke': resolve('electron/phase1-smoke.ts'),
          'phase3-smoke': resolve('electron/phase3-smoke.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve('electron/preload.ts'), formats: ['cjs'] }
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: { rollupOptions: { input: resolve('index.html') } }
  }
})
