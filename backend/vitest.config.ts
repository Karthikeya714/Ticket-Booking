import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // These are integration tests sharing one real Postgres database (no per-test transaction
    // rollback), so test files must not run concurrently — otherwise unrelated tests can
    // observe each other's in-flight rows (e.g. a global cron sweep catching another file's
    // transiently-expired hold mid-test).
    fileParallelism: false,
  },
});
