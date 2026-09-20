import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    // Begge R2-basene settes eksplisitt her slik at testsuiten ikke stilltiende
    // avhenger av utviklerens lokale .env. `readBaseUrl()` i `src/lib/image-url.ts`
    // foretrekker VITE_-varianten, så uten den feiler `publicImageUrl`-testene
    // lokalt (mot utviklerens eget bildedomene) selv om CI er grønn uten .env.
    env: {
      R2_PUBLIC_BASE_URL: "https://bilder.test.invalid",
      VITE_R2_PUBLIC_BASE_URL: "https://bilder.test.invalid",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Integration tests need a running local Supabase stack (`supabase start`)
    // and are run separately via `bun run test:rls`, not in the default suite/CI.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.integration.test.ts",
        "src/integrations/supabase/types.ts",
        "src/routeTree.gen.ts",
        "src/components/ui/**",
      ],
      // Starting point measured against the current codebase — ratchet up as
      // routes/components gain coverage (see Fase 3, punkt 9 i code-assessment-planen).
      thresholds: {
        statements: 9,
        branches: 6,
        functions: 5,
        lines: 9,
      },
    },
  },
});
