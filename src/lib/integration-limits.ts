/**
 * Miljønøytral grensekonfig for Proff-integrasjonene (Excel-import, REST-API,
 * MCP). Ingen server-imports her: modulen brukes både av servertjenester som
 * håndhever grensene og av UI som skal vise dem, slik at tallene aldri kan
 * avvike mellom det som håndheves og det som vises. Se
 * /root/.claude/plans/proff-kunder-skal-ha-mulighet-silly-crane.md, fase 1/4.
 */

export type IntegrationLimits = {
  apiKey: {
    /** Lesekall (GET) per API-nøkkel per time. */
    readPerHour: number;
    /** Skrivekall (opprett/oppdater/status) per API-nøkkel per time. */
    writePerHour: number;
    /** Batch-kall (opptil `maxBatchRows` rader) per API-nøkkel per time. */
    batchPerHour: number;
    /** Maks antall aktive (ikke tilbakekalte/utløpte) nøkler per organisasjon. */
    maxActiveKeysPerOrganization: number;
    /** Lengste varighet en nøkkel kan opprettes med. */
    maxLifetimeDays: number;
    /** Varighetsalternativene superbruker kan velge mellom ved opprettelse. */
    lifetimeOptionsDays: number[];
    /** Forhåndsvalgt varighet i opprettelsesskjemaet. */
    defaultLifetimeDays: number;
  };
  organization: {
    /** Nye annonser opprettet per organisasjon per døgn, på tvers av alle kanaler. */
    newListingsPerDay: number;
    /** Nye bilder sendt til komprimering per organisasjon per døgn. */
    newImagesPerDay: number;
  };
  /** Maks antall rader i én import- eller batch-forespørsel. */
  maxBatchRows: number;
  /** Antall dager en annonse fornyes med ved hver vellykkede maskinelle synk. */
  listingRenewalDays: number;
};

export const INTEGRATION_LIMITS: IntegrationLimits = {
  apiKey: {
    readPerHour: 300,
    writePerHour: 120,
    batchPerHour: 10,
    maxActiveKeysPerOrganization: 2,
    maxLifetimeDays: 365,
    lifetimeOptionsDays: [30, 90, 180, 365],
    defaultLifetimeDays: 90,
  },
  organization: {
    newListingsPerDay: 1000,
    newImagesPerDay: 2000,
  },
  maxBatchRows: 500,
  listingRenewalDays: 30,
};

/** Norske etiketter/forklaringer per grense, til bruk i «Integrasjoner»-UI-en
 * (fase 4). Nøklene følger strukturen i `INTEGRATION_LIMITS` slik at UI-en kan
 * slå opp riktig tekst ved siden av tallet den viser. */
export const INTEGRATION_LIMIT_LABELS_NB = {
  apiKeyReadPerHour: {
    label: "Lesekall",
    description: "Maks antall lesekall (GET) per API-nøkkel per time.",
  },
  apiKeyWritePerHour: {
    label: "Skrivekall",
    description:
      "Maks antall skrivekall (opprett/oppdater annonse, sett status) per API-nøkkel per time.",
  },
  apiKeyBatchPerHour: {
    label: "Batch-kall",
    description: `Maks antall batch-kall (opptil ${INTEGRATION_LIMITS.maxBatchRows} rader) per API-nøkkel per time.`,
  },
  apiKeyMaxActiveKeys: {
    label: "Aktive nøkler",
    description: "Maks antall aktive API-nøkler per organisasjon samtidig.",
  },
  apiKeyLifetime: {
    label: "Varighet",
    description: "Hvor lenge en nyopprettet API-nøkkel er gyldig, valgt ved opprettelse.",
  },
  organizationNewListingsPerDay: {
    label: "Nye annonser",
    description:
      "Maks antall nye annonser opprettet per organisasjon per døgn, på tvers av Excel, API og MCP. Eksisterende annonser kan fortsatt oppdateres selv om grensen er nådd.",
  },
  organizationNewImagesPerDay: {
    label: "Nye bilder",
    description: "Maks antall nye bilder sendt til komprimering per organisasjon per døgn.",
  },
  maxBatchRows: {
    label: "Rader per forespørsel",
    description: "Maks antall rader i én import- eller batch-forespørsel.",
  },
  listingRenewalDays: {
    label: "Fornyelse",
    description: "Antall dager en annonse fornyes med ved hver vellykkede maskinelle synk.",
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type IntegrationLimitKey = keyof typeof INTEGRATION_LIMIT_LABELS_NB;

/** Formatterer en grenseverdi med norsk tallformat, f.eks.
 * `formatLimit(1000, "nye annonser / døgn")` → `"1 000 nye annonser / døgn"`. */
export function formatLimit(value: number, unit: string): string {
  const formattedValue = value.toLocaleString("nb-NO");
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

/** Den norske kundevendte feilteksten når døgngrensen for nye annonser er
 * nådd. Brukes av `listing-sync.server.ts` (Excel/API/MCP) slik at teksten er
 * identisk uansett kanal. */
export function newListingsPerDayLimitMessage(): string {
  return (
    `Dagens grense på ${formatLimit(INTEGRATION_LIMITS.organization.newListingsPerDay, "nye annonser")} ` +
    "er nådd. Eksisterende annonser kan fortsatt oppdateres; prøv igjen i morgen."
  );
}

/** Den norske kundevendte advarselsteksten når døgngrensen for nye bilder er
 * nådd for en rad. Annonsen lagres uansett — kun bildene for denne raden
 * hoppes over (se `warning`-feltet på `ListingSyncResult` i
 * `listing-sync.server.ts`); ikke en feil. */
export function newImagesPerDayLimitMessage(): string {
  return (
    `Dagens grense på ${formatLimit(INTEGRATION_LIMITS.organization.newImagesPerDay, "nye bilder")} ` +
    "er nådd. Annonsen ble lagret uten disse bildene; de legges til ved neste synk."
  );
}
