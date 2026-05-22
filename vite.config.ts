import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import tailwindcss from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import { resolve } from 'path'

/**
 * Single Vite config that switches between two build targets via
 * `--mode tauri` vs the default mode:
 *
 *   default mode → web build (S3-only, deployed to GitHub Pages)
 *   --mode tauri  → Tauri-bundled webview (called by `tauri dev` /
 *                   `tauri build` via beforeDevCommand / beforeBuildCommand)
 *
 * Both share the renderer source, alias config, polyfills, and PostCSS
 * pipeline; the differences (defines, server, build target / outDir,
 * minification) are mode-driven below.
 */
export default defineConfig(({ mode }) => {
  const isTauri = mode === 'tauri'
  const tauriHost = process.env.TAURI_DEV_HOST

  return {
    root: 'src/renderer',
    base: isTauri ? '/' : (process.env.BASE_PATH ?? '/'),

    define: {
      __TAURI_BUILD__: JSON.stringify(isTauri),
      // Web build flag — read in renderer code to gate desktop-only paths.
      __WEB_BUILD__: JSON.stringify(!isTauri),
    },

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
      // Inlined from the old postcss.config.js — keeps PostCSS pipeline
      // discoverable without an extra root-level config file.
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },

    clearScreen: !isTauri ? undefined : false,

    server: isTauri
      ? {
          port: 5173,
          strictPort: true,
          host: tauriHost || false,
          hmr: tauriHost ? { protocol: 'ws', host: tauriHost, port: 1421 } : undefined,
          watch: { ignored: ['**/src-tauri/**'] },
        }
      : {
          port: 5173,
          open: true,
        },

    build: {
      outDir: isTauri ? '../../dist-tauri' : '../../dist-web',
      emptyOutDir: true,
      ...(isTauri
        ? {
            target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
            minify: !process.env.TAURI_ENV_DEBUG,
            sourcemap: !!process.env.TAURI_ENV_DEBUG,
          }
        : {}),
    },
  }
})
