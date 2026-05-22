import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@':       resolve(__dirname, 'src/renderer/src'),
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/shared/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/shared/**/*.ts'],
      exclude: ['**/*.test.*', '**/__tests__/**'],
    }
  },
})
