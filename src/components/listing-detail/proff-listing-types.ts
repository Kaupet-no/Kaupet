export const PROFF_LISTING_CONCEPTS = ["signatur", "redaksjonell", "butikk"] as const;
export type ProffListingConcept = (typeof PROFF_LISTING_CONCEPTS)[number];

export type ProffOrganizationPresentation = {
  id: string;
  displayName: string;
  organizationNumber?: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  palette: string | null;
};
