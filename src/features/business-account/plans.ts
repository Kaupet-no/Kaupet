export type BusinessPlan = "proff_basis" | "proff";

export type BusinessPlanFeature = {
  label: string;
  included: boolean;
  value?: string;
  note?: string;
};

export type BusinessPlanConfig = {
  id: BusinessPlan;
  name: string;
  monthlyPriceNok: number;
  trialText?: string;
  features: readonly BusinessPlanFeature[];
};

/** Billing period a business can order Proff for. Prices are ex. VAT. */
export type ProffTerm = "monthly" | "yearly";

export type ProffTermConfig = {
  id: ProffTerm;
  months: number;
  /** Total price for the whole term, ex. VAT. Hardcoded so price changes never yield fractional kroner. */
  priceExVatNok: number;
  discountPct: number;
};

export const PROFF_TERMS = {
  monthly: { id: "monthly", months: 1, priceExVatNok: 1490, discountPct: 0 },
  yearly: { id: "yearly", months: 12, priceExVatNok: 16092, discountPct: 10 },
} as const satisfies Record<ProffTerm, ProffTermConfig>;

/** What the term costs per month, ex. VAT — the number used to compare terms. */
export function proffTermMonthlyExVatNok(term: ProffTerm): number {
  const config = PROFF_TERMS[term];
  return Math.round(config.priceExVatNok / config.months);
}

const sharedFeatures = [
  { label: "Opprette ubegrenset antall annonser i alle kategorier", included: true },
  { label: "Sende og motta meldinger", included: true },
  { label: "Opprette søk og varsler", included: true },
  { label: "Informasjon om bedriften på egne annonser", included: true },
] as const;

export const BUSINESS_PLANS = {
  proff_basis: {
    id: "proff_basis",
    name: "Proff basis",
    monthlyPriceNok: 0,
    features: [
      ...sharedFeatures,
      { label: "Brukerkontoer", included: true, value: "1" },
      {
        label: "Egen branding på annonser",
        included: false,
        note: "Tilgjengelig med Proff.",
      },
      {
        label: "Andre annonser fra bedriften vises i egne annonser",
        included: false,
        note: "Tilgjengelig med Proff.",
      },
      {
        label: "Nettsidelenke på egne annonser",
        included: false,
        note: "Tilgjengelig med Proff.",
      },
      {
        label: "Opprett flere annonser om gangen med Excel/CSV",
        included: false,
        note: "Tilgjengelig med Proff. Kommer senere.",
      },
      {
        label: "API-integrasjon",
        included: false,
        note: "Tilgjengelig med Proff. Kommer senere.",
      },
      { label: "Prioritert support", included: false, note: "Tilgjengelig med Proff." },
    ],
  },
  proff: {
    id: "proff",
    name: "Proff",
    monthlyPriceNok: 1490,
    trialText: "30 dager gratis prøveperiode",
    features: [
      ...sharedFeatures,
      { label: "Brukerkontoer", included: true, value: "Ubegrenset" },
      { label: "Egen branding på annonser", included: true },
      { label: "Andre annonser fra bedriften vises i egne annonser", included: true },
      { label: "Nettsidelenke på egne annonser", included: true },
      {
        label: "Opprett flere annonser om gangen med Excel/CSV",
        included: true,
        note: "Kommer senere.",
      },
      { label: "API-integrasjon", included: true, note: "Kommer senere." },
      { label: "Prioritert support", included: true },
    ],
  },
} as const satisfies Record<BusinessPlan, BusinessPlanConfig>;

export type BusinessOrganizationEntitlement = {
  selected_plan: string | null;
  proff_access_until: string | null;
};

/** The database entitlement timestamp is authoritative; the client never infers trial state. */
export function hasEffectiveProffAccess(
  organization: BusinessOrganizationEntitlement | null | undefined,
  now = Date.now(),
): boolean {
  if (organization?.selected_plan !== "proff" || !organization.proff_access_until) return false;
  const accessUntil = Date.parse(organization.proff_access_until);
  return Number.isFinite(accessUntil) && now < accessUntil;
}
