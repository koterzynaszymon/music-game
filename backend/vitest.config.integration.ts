import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Integration tests: talk to real services (Redis in Docker).
// Kept out of `npm run test`, so unit tests stay fast and need no Docker.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    // All integration files share one Redis database and each test FLUSHes it,
    // so files must run one after another, not in parallel
    fileParallelism: false,
  },
});
