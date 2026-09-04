export const PROFF_LISTING_CONCEPTS = ["signatur", "redaksjonell", "butikk"] as const;
export type ProffListingConcept = (typeof PROFF_LISTING_CONCEPTS)[number];

export const PROFF_LISTING_CONCEPT_LABELS: Record<ProffListingConcept, string> = {
  signatur: "Signatur",
  redaksjonell: "Redaksjonell",
  butikk: "Butikkprofil",
};

export const PROFF_LISTING_FONTS = ["newsreader", "inter"] as const;
export type ProffListingFont = (typeof PROFF_LISTING_FONTS)[number];
export const PROFF_LISTING_FONT_LABELS: Record<ProffListingFont, string> = {
  newsreader: "Newsreader",
  inter: "Inter",
};

export const PROFF_LISTING_OVERTITLES = [
  "annonse_fra",
  "presentert_av",
  "bedriftsannonse",
] as const;
export type ProffListingOvertitle = (typeof PROFF_LISTING_OVERTITLES)[number];
export const PROFF_LISTING_OVERTITLE_LABELS: Record<ProffListingOvertitle, string> = {
  annonse_fra: "Annonse fra",
  presentert_av: "Presentert av",
  bedriftsannonse: "Bedriftsannonse",
};

export const DEFAULT_PROFF_LISTING_CONCEPT: ProffListingConcept = "redaksjonell";
export const DEFAULT_PROFF_LISTING_FONT: ProffListingFont = "newsreader";
export const DEFAULT_PROFF_LISTING_OVERTITLE: ProffListingOvertitle = "presentert_av";

export type ProffOrganizationPresentation = {
  id: string;
  displayName: string;
  organizationNumber?: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  palette: string | null;
  concept?: ProffListingConcept;
  font?: ProffListingFont;
  overtitle?: ProffListingOvertitle;
};
