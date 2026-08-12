import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "src/integrations/supabase/types.ts",
      "src/routeTree.gen.ts",
      "android/.gradle/**",
      "android/app/build/**",
      "android/build/**",
    ],
  },
  {
    files: [
      "src/routes/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Use a *.server.ts module and keep it behind a server function.",
            },
          ],
          patterns: [
            {
              group: ["@/**/*.server", "@/**/*.server.*", "**/*.server", "**/*.server.*"],
              message:
                "Client-reachable code must not import *.server modules. Move shared types/constants to a neutral module and import that instead.",
            },
          ],
        },
      ],
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "jsx-a11y/label-has-associated-control": [
        "error",
        // Radix primitives that render a focusable control but aren't
        // recognized by the rule's default (native-tag-only) control list.
        { controlComponents: ["Checkbox", "Switch", "RadioGroupItem"] },
      ],
      // Downgraded from "error" (not "off") pending an incremental cleanup —
      // there are ~60 pre-existing violations across the codebase that need
      // per-file review rather than a blind bulk fix. New violations still
      // surface as lint warnings; tighten back to "error" as files are cleaned up.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/refs": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["Route"] },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Files that are meant to stay vertical-agnostic (no direct knowledge of
    // any single category vertical like vehicles). Category-specific
    // behavior should be expressed through `CategoryBehavior`
    // (src/lib/category-behavior.ts), not by importing vehicle-only code
    // here — that's the isVehicle-boolean-in-generic-code drift this rule
    // exists to prevent (see commit 71fa7bd for what that drift caused).
    files: [
      "src/lib/category-filters.ts",
      "src/lib/category-behavior.ts",
      "src/lib/listings.functions.ts",
      "src/features/listing-creation/category-flows.ts",
      "src/features/listing-creation/modules/registry.ts",
      "src/features/listing-creation/field-groups/validators.ts",
      "src/features/listing-creation/field-groups/delivery-location/**",
      "src/features/listing-creation/field-groups/category-attributes/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/vehicle/*", "@/lib/vehicle/**"],
              message:
                "This file is meant to stay vertical-agnostic. Add/read a flag on CategoryBehavior (src/lib/category-behavior.ts) instead of importing vehicle-specific code directly.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
