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
      // Existing, audited prop/browser-state synchronization sites are
      // baselined in eslint-suppressions.json. The rule remains an error so
      // new sites fail lint instead of silently expanding that baseline.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/static-components": "warn",
      "react-hooks/incompatible-library": "error",
      // Remaining findings are React Hook Form callback refs/render-props,
      // tracked explicitly in eslint-suppressions.json. New ref reads fail.
      "react-hooks/refs": "error",
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
        {
          allowConstantExport: true,
          allowExportNames: [
            "Route",
            // Stable companion APIs intentionally colocated with their
            // component/provider. Keep this explicit so new mixed exports
            // still surface instead of disabling Fast Refresh validation.
            "describeAttrValue",
            "useAllCategoryFilters",
            "secondaryFilterCount",
            "isBoatAttributes",
            "clampToBounds",
            "scaleAround",
            "defaultMarkerIcon",
            "CIRCLE_STYLE",
            "LISTING_REPORT_REASONS",
            "USER_REPORT_REASONS",
            "genericAttributesModule",
            "useVehicleBrandOptions",
            "useVehicleModelOptionsGrouped",
            "useVehicleModelOptionsForBrands",
            "useSearchPanel",
            "useRegisterSearchPanelResults",
            "countActiveFilters",
            "useTheme",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // TanStack Router route modules export `Route`; their component functions
    // stay local and are referenced from that route object. The generic React
    // Refresh rule misclassifies those local functions as missing component
    // exports, while TanStack's Vite plugin owns route HMR/code splitting.
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
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
