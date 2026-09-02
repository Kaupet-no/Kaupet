import { PROFF_TERMS, proffTermMonthlyExVatNok, type ProffTerm } from "./plans";

const nok = new Intl.NumberFormat("nb-NO");

/** B2B prices are always shown ex. VAT; Fiken adds 25 % on the invoice. */
export function formatProffTermPrice(term: ProffTerm): string {
  const config = PROFF_TERMS[term];
  const period = config.months === 12 ? "per år" : "per måned";
  return `${nok.format(config.priceExVatNok)} kr ${period} eks. mva`;
}

/** Secondary line for the yearly term: what it works out to per month. */
export function formatProffTermMonthlyEquivalent(term: ProffTerm): string | null {
  if (PROFF_TERMS[term].months === 1) return null;
  return `Tilsvarer ${nok.format(proffTermMonthlyExVatNok(term))} kr per måned eks. mva`;
}
