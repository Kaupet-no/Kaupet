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
  },
});
