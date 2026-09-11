/** Delt kilde for bedriftens annonseheader-farge. Verdien i
 * `organizations.brand_palette` er enten en av de forhåndsdefinerte
 * paletten-ID-ene eller en egendefinert hex-farge (`#rrggbb`).
 * Både bedriftsprofilen og annonsevisningen leser fargene herfra slik at
 * forhåndsvisningen alltid er lik det kjøperen ser. */

export const BRAND_PALETTES = [
  { id: "forest", label: "Skog", background: "oklch(0.35 0.06 160)" },
  { id: "navy", label: "Marineblå", background: "oklch(0.32 0.08 250)" },
  { id: "burgundy", label: "Burgunder", background: "oklch(0.34 0.09 20)" },
  { id: "slate", label: "Skifer", background: "oklch(0.32 0.02 250)" },
] as const;

export type BrandPaletteId = (typeof BRAND_PALETTES)[number]["id"];

export const BRAND_FOREGROUND_LIGHT = "oklch(0.985 0.012 85)";
export const BRAND_FOREGROUND_DARK = "oklch(0.22 0.01 250)";
export const DEFAULT_BRAND_PALETTE: BrandPaletteId = "forest";

/** Normaliserer brukerinput til `#rrggbb`, eller null om det ikke er en
 * gyldig hex-farge. Godtar med/uten `#` og kortformen `#abc`. */
export function normalizeHexColor(input: string): string | null {
  const value = input.trim().replace(/^#/u, "").toLowerCase();
  if (/^[0-9a-f]{3}$/u.test(value)) {
    return `#${value
      .split("")
      .map((character) => character + character)
      .join("")}`;
  }
  return /^[0-9a-f]{6}$/u.test(value) ? `#${value}` : null;
}

export function isHexBrandColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/u.test(value);
}

/** WCAG 2.1 relativ luminans (sRGB). Brukes bare til å velge mellom lys og
 * mørk tekst på en egendefinert bakgrunn. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Terskelen der hvit og svart tekst gir samme kontrast mot bakgrunnen
 * (WCAG-kontrastformelen krysser ved L ≈ 0.179). */
export function brandForegroundFor(hex: string): string {
  return relativeLuminance(hex) > 0.179 ? BRAND_FOREGROUND_DARK : BRAND_FOREGROUND_LIGHT;
}

/** Løser opp lagret verdi til bakgrunns- og tekstfarge for annonseheaderen. */
export function resolveBrandColors(value: string | null | undefined): {
  background: string;
  foreground: string;
} {
  const stored = value ?? "";
  if (isHexBrandColor(stored)) {
    return { background: stored, foreground: brandForegroundFor(stored) };
  }
  const palette =
    BRAND_PALETTES.find((entry) => entry.id === stored) ??
    BRAND_PALETTES.find((entry) => entry.id === DEFAULT_BRAND_PALETTE)!;
  return { background: palette.background, foreground: BRAND_FOREGROUND_LIGHT };
}
