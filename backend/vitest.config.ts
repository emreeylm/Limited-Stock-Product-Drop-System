import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: __dirname,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/lib/**'],
    },
  },
});
