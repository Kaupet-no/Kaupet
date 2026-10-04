// Kvitteringer for bedriftskontoer og Proff. Samme design som varslene i
// email-templates.ts, men med egen bunntekst: kvitteringer kan ikke avmeldes.
// Tekstene er godkjent i «Kvitteringer for bedriftskontoer» (4. okt. 2026) og
// følger bedriftsvilkårene § 9.
import { PROFF_TERMS, type ProffTerm } from "@/features/business-account/plans";
import { formatProffTermPrice } from "@/features/business-account/proff-pricing";
import { COLOR, escapeHtml } from "@/lib/email-templates";

export const PROFF_CONTACT_EMAIL = "proff@kaupet.no";
const SITE = "https://kaupet.no";
const DAY_MS = 864e5;

export type BusinessEmail = { subject: string; html: string; text: string };

type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "facts"; rows: [string, string][] };

/** «3. november 2026» i norsk tid. */
export function formatEmailDate(iso: string) {
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "long", timeZone: "Europe/Oslo" }).format(
    new Date(iso),
  );
}

function daysBefore(iso: string, days: number) {
  return new Date(Date.parse(iso) - days * DAY_MS).toISOString();
}

function termLabel(term: ProffTerm) {
  return PROFF_TERMS[term].months === 12 ? "Årlig" : "Månedlig";
}

function render(params: {
  organizationName: string;
  eyebrow: string;
  title: string;
  blocks: Block[];
  cta: { label: string; path: string };
}): Omit<BusinessEmail, "subject"> {
  const url = `${SITE}${params.cta.path}`;
  const footer = `Du får denne e-posten fordi ${params.organizationName} har en bedriftskonto på Kaupet.no. Kvitteringer om kontoen sendes alltid og kan ikke avmeldes.`;
  const contact = `Spørsmål om Proff-avtalen? Svar på denne e-posten eller skriv til ${PROFF_CONTACT_EMAIL}.`;

  const p = (text: string, color: string = COLOR.text) =>
    `<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:${color};">${escapeHtml(text)}</p>`;
  const blockHtml = (block: Block) => {
    if (block.kind === "p") return p(block.text);
    if (block.kind === "list") {
      return `<ul style="margin:0 0 14px; padding-left:20px; font-size:15px; line-height:1.6; color:${COLOR.text};">${block.items
        .map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px; border:1px solid ${COLOR.border}; border-radius:10px;">${block.rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:8px 12px; font-size:14px; color:${COLOR.muted}; white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 12px; font-size:14px; color:${COLOR.text};">${escapeHtml(value)}</td></tr>`,
      )
      .join("")}</table>`;
  };

  const html = `<!DOCTYPE html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.title)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLOR.background}; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.background};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding-bottom:24px;" align="center">
                <span style="font-family:Georgia,'Newsreader',serif; font-size:20px; font-weight:600; letter-spacing:-0.01em;">
                  <span style="color:${COLOR.primary};">Kaupet</span><span style="color:${COLOR.accent};">.</span><span style="color:${COLOR.muted};">no</span>
                </span>
              </td>
            </tr>
            <tr>
              <td style="background-color:${COLOR.card}; border:1px solid ${COLOR.border}; border-radius:16px; padding:32px;">
                <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.accent};">${escapeHtml(params.eyebrow)}</p>
                <h1 style="margin:0 0 16px; font-family:Georgia,'Newsreader',serif; font-size:22px; font-weight:600; color:${COLOR.text}; letter-spacing:-0.01em;">${escapeHtml(params.title)}</h1>
                ${params.blocks.map(blockHtml).join("\n                ")}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px;">
                  <tr>
                    <td style="border-radius:10px; background-color:${COLOR.primary};">
                      <a href="${url}" style="display:inline-block; padding:12px 22px; font-size:14px; font-weight:600; color:${COLOR.primaryForeground}; text-decoration:none; border-radius:10px;">${escapeHtml(params.cta.label)}</a>
                    </td>
                  </tr>
                </table>
                ${p(contact, COLOR.muted)}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;" align="center">
                <p style="margin:0; font-size:12px; line-height:1.6; color:${COLOR.muted};">${escapeHtml(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    params.title,
    "",
    ...params.blocks.flatMap((block) =>
      block.kind === "p"
        ? [block.text, ""]
        : block.kind === "list"
          ? [...block.items.map((item) => `- ${item}`), ""]
          : [...block.rows.map(([label, value]) => `${label}: ${value}`), ""],
    ),
    `${params.cta.label}: ${url}`,
    "",
    contact,
    "",
    footer,
  ].join("\n");

  return { html, text };
}

const PROFF_FEATURES = [
  "Egen branding med logo og farger på annonsene",
  "Nettsidelenke og bedriftens andre annonser i hver annonse",
  "Ubegrenset antall brukere",
  "Opplasting av mange annonser om gangen med Excel/CSV",
  "API-integrasjon og prioritert support",
];

const DOWNGRADE_NOTE =
  "Når Proff er over, blir egen branding, nettsidelenke og brukere utover den første utilgjengelige. Ingen data slettes.";

/** E-post 1: ny bedriftskonto. */
export function welcomeEmail(org: {
  displayName: string;
  legalName: string;
  organizationNumber: string;
}): BusinessEmail {
  const orgNumber = org.organizationNumber.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  return {
    subject: `Velkommen til Kaupet, ${org.displayName}`,
    ...render({
      organizationName: org.legalName,
      eyebrow: "Bedriftskonto opprettet",
      title: `Velkommen til Kaupet, ${org.displayName}!`,
      blocks: [
        {
          kind: "p",
          text: `Bedriftskontoen for ${org.legalName} (org.nr. ${orgNumber}) er klar, og du er registrert som superbruker. Det betyr at du styrer plan, bedriftsprofil og hvem som har tilgang.`,
        },
        { kind: "p", text: "Slik kommer du i gang:" },
        {
          kind: "list",
          items: [
            "Velg plan. Proff basis er gratis og lar bedriften publisere ubegrenset antall annonser. Proff gir egen branding, flere brukere, opplasting av mange annonser med Excel/CSV og API-integrasjon. Du kan prøve Proff gratis i 30 dager.",
            "Fyll ut bedriftsprofilen, så kjøperne ser hvem de handler med.",
            "Publiser den første annonsen.",
          ],
        },
      ],
      cta: { label: "Gå til bedriftskonsollet", path: "/bedrift" },
    }),
  };
}

/** E-post 2: prøveperioden har startet med første bestilling. */
export function trialStartedEmail(params: {
  displayName: string;
  legalName: string;
  term: ProffTerm;
  trialEndsAt: string;
  billingEmail: string;
}): BusinessEmail {
  const ends = formatEmailDate(params.trialEndsAt);
  return {
    subject: "Takk! Prøveperioden for Kaupet Proff har startet",
    ...render({
      organizationName: params.legalName,
      eyebrow: "Prøveperiode startet",
      title: "Velkommen til Kaupet Proff",
      blocks: [
        {
          kind: "p",
          text: `Takk for at ${params.displayName} har valgt Kaupet Proff. Prøveperioden er i gang og varer til ${ends}. Alt i Proff er tilgjengelig fra nå:`,
        },
        { kind: "list", items: PROFF_FEATURES },
        {
          kind: "facts",
          rows: [
            ["Abonnement", `${termLabel(params.term)}, ${formatProffTermPrice(params.term)}`],
            [
              "Første faktura",
              `Sendes til ${params.billingEmail} senest ${formatEmailDate(daysBefore(params.trialEndsAt, 14))}`,
            ],
            ["Forfall", `${ends}, samme dag som prøveperioden slutter`],
          ],
        },
        {
          kind: "p",
          text: "Når fakturaen er betalt, fortsetter Proff uten avbrudd. Blir den ikke betalt, avsluttes Proff når prøveperioden er over.",
        },
        {
          kind: "p",
          text: `Vil du ikke fortsette, kan du avslutte prøveperioden i bedriftskonsollet før ${ends}. Da blir du ikke fakturert.`,
        },
      ],
      cta: { label: "Kom i gang med Proff", path: "/bedrift" },
    }),
  };
}

/** E-post 3: prøveperioden er avsluttet av bedriften. */
export function trialEndedEmail(params: {
  displayName: string;
  legalName: string;
  endedAt: string;
  /** Satt når en faktura allerede var sendt; den krediteres. */
  sentInvoiceNumber: string | null;
}): BusinessEmail {
  return {
    subject: "Prøveperioden for Kaupet Proff er avsluttet",
    ...render({
      organizationName: params.legalName,
      eyebrow: "Prøveperiode avsluttet",
      title: "Prøveperioden er avsluttet",
      blocks: [
        {
          kind: "p",
          text: `Prøveperioden for ${params.displayName} ble avsluttet ${formatEmailDate(params.endedAt)}. Proff-funksjonene er slått av, og bedriften fortsetter på Proff basis, som er gratis.`,
        },
        {
          kind: "p",
          text: params.sentInvoiceNumber
            ? `Har du fått faktura ${params.sentInvoiceNumber} fra oss, kan du se bort fra den. Vi sender en kreditnota.`
            : "Du blir ikke fakturert.",
        },
        {
          kind: "p",
          text: "Ingen data slettes. Logo, bedriftsprofil og medlemmer er lagret, men brukere utover den første mister tilgangen. Prøveperioden kan ikke startes på nytt, men du kan bestille Proff igjen når som helst.",
        },
      ],
      cta: { label: "Se planene", path: "/bedrift/velg-plan" },
    }),
  };
}

/**
 * E-post 4: betaling registrert. `firstPeriod` er overgangen fra prøve (eller
 * fra utløpt Proff) til betalt periode og sendes alltid; senere betalinger gir
 * kvittering bare når bedriften har valgt det i fakturaprofilen.
 */
export function proffPaidEmail(params: {
  displayName: string;
  legalName: string;
  firstPeriod: boolean;
  term: ProffTerm;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
}): BusinessEmail {
  const invoice = params.invoiceNumber ? `faktura ${params.invoiceNumber}` : "fakturaen";
  return {
    subject: params.firstPeriod
      ? "Betalingen er mottatt – Kaupet Proff er aktivt"
      : "Betaling mottatt for Kaupet Proff",
    ...render({
      organizationName: params.legalName,
      eyebrow: params.firstPeriod ? "Proff aktivert" : "Betaling mottatt",
      title: params.firstPeriod ? "Kaupet Proff er aktivt" : "Takk for betalingen",
      blocks: [
        {
          kind: "p",
          text: `Takk! Vi har registrert betalingen av ${invoice}. Proff er aktivt for ${params.displayName} ut den betalte perioden.`,
        },
        {
          kind: "facts",
          rows: [
            ["Abonnement", `${termLabel(params.term)}, ${formatProffTermPrice(params.term)}`],
            [
              "Betalt periode",
              `${formatEmailDate(params.periodStart)} – ${formatEmailDate(params.periodEnd)}`,
            ],
            [
              "Neste faktura",
              `Sendes senest ${formatEmailDate(daysBefore(params.periodEnd, 14))}, forfall ${formatEmailDate(params.periodEnd)}`,
            ],
          ],
        },
        {
          kind: "p",
          text: "Abonnementet fornyes automatisk med en ny periode av samme lengde. Sier du opp, varer Proff ut perioden som er betalt, og du blir ikke fakturert for neste.",
        },
      ],
      cta: { label: "Åpne bedriftskonsollet", path: "/bedrift" },
    }),
  };
}

/** E-post 5: betalt Proff er sagt opp og løper ut perioden. */
export function proffCancelledEmail(params: {
  displayName: string;
  legalName: string;
  cancelledAt: string;
  accessUntil: string;
  /** Faktura for neste periode som allerede var sendt; den krediteres. */
  sentInvoiceNumber: string | null;
}): BusinessEmail {
  const until = formatEmailDate(params.accessUntil);
  const blocks: Block[] = [
    {
      kind: "p",
      text: `Vi bekrefter at ${params.displayName} sa opp Kaupet Proff ${formatEmailDate(params.cancelledAt)}. Proff er aktivt ut den betalte perioden, til ${until}. Etter det fortsetter bedriften på Proff basis, som er gratis, og du blir ikke fakturert for neste periode.`,
    },
  ];
  if (params.sentInvoiceNumber) {
    blocks.push({
      kind: "p",
      text: `Har du allerede fått faktura ${params.sentInvoiceNumber} for neste periode, kan du se bort fra den. Vi sender en kreditnota.`,
    });
  }
  blocks.push(
    { kind: "p", text: DOWNGRADE_NOTE },
    {
      kind: "p",
      text: `Ombestemt deg? Du kan fortsette abonnementet i bedriftskonsollet frem til ${until}.`,
    },
  );
  return {
    subject: "Oppsigelsen av Kaupet Proff er bekreftet",
    ...render({
      organizationName: params.legalName,
      eyebrow: "Oppsigelse bekreftet",
      title: `Proff varer til ${until}`,
      blocks,
      cta: { label: "Åpne bedriftskonsollet", path: "/bedrift" },
    }),
  };
}

/**
 * E-post 5B: Kaupet har avsluttet Proff-avtalen fra adminpanelet. Proff varer
 * ut perioden som er betalt (bedriftsvilkårene § 9). Fast tekst; admins
 * interne notat sendes aldri.
 */
export function proffEndedByKaupetEmail(params: {
  displayName: string;
  legalName: string;
  /** Satt når betalt tilgang fortsatt løper; null når Proff alt er over. */
  accessUntil: string | null;
  /** Forfalt, ubetalt faktura som er årsaken. */
  overdueInvoice: { number: string; dueOn: string } | null;
  /** Sendt faktura som nå er kansellert og krediteres. */
  creditedInvoiceNumber: string | null;
}): BusinessEmail {
  const until = params.accessUntil ? formatEmailDate(params.accessUntil) : null;
  const blocks: Block[] = [
    {
      kind: "p",
      text: params.overdueInvoice
        ? `Vi har ikke mottatt betaling for faktura ${params.overdueInvoice.number} med forfall ${formatEmailDate(params.overdueInvoice.dueOn)}. Proff-avtalen for ${params.displayName} er derfor avsluttet.`
        : `Kaupet har avsluttet Proff-avtalen for ${params.displayName}.`,
    },
    {
      kind: "p",
      text: until
        ? `Proff er aktivt ut perioden som er betalt, til ${until}. Etter det fortsetter bedriften på Proff basis, som er gratis, og du blir ikke fakturert for flere perioder.`
        : "Bedriften fortsetter på Proff basis, som er gratis, og du blir ikke fakturert for flere perioder.",
    },
  ];
  if (params.creditedInvoiceNumber) {
    blocks.push({
      kind: "p",
      text: `Vi sender en kreditnota for faktura ${params.creditedInvoiceNumber}, så du kan se bort fra den.`,
    });
  }
  blocks.push(
    { kind: "p", text: DOWNGRADE_NOTE },
    {
      kind: "p",
      text: "Har du betalt nylig, kan betalingen ha krysset denne e-posten. Svar oss, så ordner vi det. Du kan bestille Proff igjen når som helst.",
    },
  );
  return {
    subject: "Kaupet Proff er avsluttet",
    ...render({
      organizationName: params.legalName,
      eyebrow: "Proff avsluttet",
      title: until ? `Proff varer til ${until}` : "Kaupet Proff er avsluttet",
      blocks,
      cta: { label: "Se planene", path: "/bedrift/velg-plan" },
    }),
  };
}
