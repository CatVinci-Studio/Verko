import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Standalone renderer preview (no Electron, window.api is mocked)
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src'),
    }
  },
  define: {
    // Provide a stub window.api so the renderer doesn't crash without Electron
    'window.api': JSON.stringify({})
  },
  server: {
    port: 5173,
    open: true,
  }
})
