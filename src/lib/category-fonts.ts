/**
 * Fixed set of fonts an admin can pick for a main category's landing-page
 * heading. All stacks resolve to fonts/fallbacks already loaded by the app
 * (see src/styles.css), so picking one never requires loading new assets.
 */
export const CATEGORY_HEADING_FONTS = {
  display: { label: "Fraunces (standard)", stack: "var(--font-display)" },
  sans: { label: "Inter", stack: "var(--font-sans)" },
  serif_system: { label: "Systemserif", stack: "ui-serif, Georgia, serif" },
  sans_system: { label: "Systemgrotesk", stack: "ui-sans-serif, system-ui, sans-serif" },
} as const;

export type CategoryHeadingFont = keyof typeof CATEGORY_HEADING_FONTS;

export const DEFAULT_CATEGORY_HEADING_FONT: CategoryHeadingFont = "display";

export function categoryHeadingFontStack(token: string | null | undefined): string {
  if (token && token in CATEGORY_HEADING_FONTS) {
    return CATEGORY_HEADING_FONTS[token as CategoryHeadingFont].stack;
  }
  return CATEGORY_HEADING_FONTS[DEFAULT_CATEGORY_HEADING_FONT].stack;
}
