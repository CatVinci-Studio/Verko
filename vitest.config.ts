import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared':   resolve(__dirname, 'src/shared'),
      '@electron': resolve(__dirname, 'src/electron'),
      '@':         resolve(__dirname, 'src/renderer/src'),
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/{electron,shared}/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/{electron,shared}/**/*.ts'],
      exclude: ['**/*.test.*', '**/__tests__/**'],
    }
  },
})
