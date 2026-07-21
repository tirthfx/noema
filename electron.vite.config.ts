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
          'phase0-smoke': resolve('electron/phase0-smoke.ts'),
          'phase1-smoke': resolve('electron/phase1-smoke.ts'),
          'phase3-smoke': resolve('electron/phase3-smoke.ts'),
          'phase4-smoke': resolve('electron/phase4-smoke.ts'),
          'phase5-smoke': resolve('electron/phase5-smoke.ts'),
          'phase6-smoke': resolve('electron/phase6-smoke.ts'),
          'phase9-smoke': resolve('electron/phase9-smoke.ts'),
          'phase10-smoke': resolve('electron/phase10-smoke.ts'),
          'phase11-smoke': resolve('electron/phase11-smoke.ts'),
          'phase12-smoke': resolve('electron/phase12-smoke.ts'),
          'live-context-check': resolve('electron/live-context-check.ts'),
          'mcp-server': resolve('electron/mcp-server.ts')
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
