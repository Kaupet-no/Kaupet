import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Integration tests need a running local Supabase stack (`supabase start`)
    // and are run separately via `bun run test:rls`, not in the default suite/CI.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
