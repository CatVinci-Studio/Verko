import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Standalone renderer preview (no Electron, window.api is mocked).
// Also used for the GitHub Pages deploy. The BASE_PATH env lets the
// release workflow inject the repo subpath so assets resolve at /Verko/.
export default defineConfig({
  root: 'src/renderer',
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src'),
    }
  },
  // No `define` for window.api — let it stay undefined in the browser so the
  // renderer's ipc.ts fallback (`window.api ?? webStub`) picks up the stub.
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true,
  }
})
