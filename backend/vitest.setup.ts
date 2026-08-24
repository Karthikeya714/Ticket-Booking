import dotenv from "dotenv";

// Must run before any test file imports src/env.ts (which does `import "dotenv/config"`,
// loading .env by default) — dotenv.config() never overrides a var that's already set, so
// loading .env.test first here is what makes tests point at ticketing_test instead of the
// real dev/seed database.
dotenv.config({ path: ".env.test", override: true });
