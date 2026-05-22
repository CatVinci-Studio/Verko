import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { resolve } from 'path'

/**
 * Single-target Vite config for the Tauri-bundled webview.
 *
 * Called by `tauri dev` / `tauri build` via beforeDevCommand /
 * beforeBuildCommand in src-tauri/tauri.conf.json.
 */
export default defineConfig(() => {
  const tauriHost = process.env.TAURI_DEV_HOST

  return {
    root: 'src/renderer',
    base: '/',

    plugins: [
      react(),
      // gray-matter / papaparse / minisearch all reach for `Buffer` + `process`.
      nodePolyfills({ include: ['buffer', 'process', 'util'] }),
    ],

    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@':       resolve(__dirname, 'src/renderer/src'),
      },
    },

    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },

    clearScreen: false,

    server: {
      port: 5173,
      strictPort: true,
      host: tauriHost || false,
      hmr: tauriHost ? { protocol: 'ws', host: tauriHost, port: 1421 } : undefined,
      watch: { ignored: ['**/src-tauri/**'] },
    },

    build: {
      outDir: '../../dist-tauri',
      emptyOutDir: true,
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
      minify: !process.env.TAURI_ENV_DEBUG,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
  }
})
