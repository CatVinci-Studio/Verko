import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  // The Electron main-process source lives at `src/electron/`. Calling it
  // `main` invited confusion with React's `main.tsx` and gave the wrong
  // impression of importance — it's a thin IO shim.
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared':   resolve('src/shared'),
        '@electron': resolve('src/electron'),
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/electron/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@':       resolve('src/renderer/src'),
      }
    },
    plugins: [
      react(),
      // Library now runs in the renderer; gray-matter / papaparse / minisearch
      // all reach for `Buffer` / `process`, which don't exist in the webview.
      nodePolyfills({ include: ['buffer', 'process', 'util'] }),
    ],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') }
      }
    }
  }
})
