import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@':       resolve(__dirname, 'src/renderer/src'),
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/renderer/src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/renderer/src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/renderer/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/__tests__/**', 'src/renderer/src/components/ui/**'],
    }
  },
})
