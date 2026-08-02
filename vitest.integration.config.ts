import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Separate config for integration tests (currently just RLS tests) — these
// need a running Supabase stack and must stay out of the default `vitest
// run` (see vitest.config.ts), which excludes `*.integration.test.ts`.
export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // Default 5s is too short once signInWithRetry's rate-limit backoff
    // kicks in (up to ~1.5+3+4.5+6+7.5s across 5 attempts) — a test with
    // two or three sign-ins can legitimately take longer than that even
    // though nothing is actually broken.
    testTimeout: 30000,
  },
});
