import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/services/typesense.services.ts',
        'src/controllers/search.controllers.ts',
        'src/services/products.services.ts',
        'src/services/articles.services.ts',
        // Chat module
        'src/services/chats.services.ts',
        'src/middlewares/chats.middlewares.ts',
        'src/controllers/chats.controllers.ts',
        'src/controllers/admin.controllers.ts',
      ],
      exclude: ['node_modules/**', 'src/tests/**'],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 80,
        lines: 75
      }
    },
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src')
    }
  }
})
