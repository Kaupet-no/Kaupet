import { describe, expect, it } from "vitest";

import {
  PROFF_CONTACT_EMAIL,
  proffCancelledEmail,
  proffPaidEmail,
  trialEndedEmail,
  trialStartedEmail,
  welcomeEmail,
} from "./business-email-templates";

const org = { displayName: "Sykkelhuset", legalName: "Sykkelhuset AS" };

describe("kvitteringer for bedriftskontoer", () => {
  it("har kontaktadresse og bunntekst for kvitteringer i både HTML og ren tekst", () => {
    const email = welcomeEmail({ ...org, organizationNumber: "987654321" });
    for (const body of [email.html, email.text]) {
      expect(body).toContain(PROFF_CONTACT_EMAIL);
      expect(body).toContain("kan ikke avmeldes");
    }
    expect(email.subject).toBe("Velkommen til Kaupet, Sykkelhuset");
    expect(email.text).toContain("org.nr. 987 654 321");
    expect(email.text).toContain("https://kaupet.no/bedrift");
  });

  it("escaper bedriftsnavn i HTML", () => {
    const email = welcomeEmail({
      displayName: "<b>Ond</b>",
      legalName: "Ond & Co AS",
      organizationNumber: "987654321",
    });
    expect(email.html).not.toContain("<b>Ond</b>");
    expect(email.html).toContain("&lt;b&gt;Ond&lt;/b&gt;");
    expect(email.html).toContain("Ond &amp; Co AS");
  });

  it("prøvestart forklarer første faktura, forfall og at Proff stopper uten betaling", () => {
    const email = trialStartedEmail({
      ...org,
      term: "monthly",
      trialEndsAt: "2026-11-03T10:00:00.000Z",
      billingEmail: "faktura@sykkelhuset.no",
    });
    expect(email.text).toContain("varer til 3. november 2026");
    expect(email.text).toContain("Sendes til faktura@sykkelhuset.no senest 20. oktober 2026");
    expect(email.text).toContain("Forfall: 3. november 2026");
    expect(email.text).toContain("avsluttes Proff når prøveperioden er over");
  });

  it("avsluttet prøve nevner kreditnota bare når en faktura var sendt", () => {
    const base = { ...org, endedAt: "2026-10-12T10:00:00.000Z" };
    expect(trialEndedEmail({ ...base, sentInvoiceNumber: null }).text).toContain(
      "Du blir ikke fakturert.",
    );
    const sent = trialEndedEmail({ ...base, sentInvoiceNumber: "10005" }).text;
    expect(sent).toContain("faktura 10005");
    expect(sent).toContain("kreditnota");
  });

  it("skiller aktivering fra kvittering for fornyelse", () => {
    const base = {
      ...org,
      term: "yearly" as const,
      invoiceNumber: "10005",
      periodStart: "2026-11-03T10:00:00.000Z",
      periodEnd: "2027-11-03T10:00:00.000Z",
    };
    expect(proffPaidEmail({ ...base, firstPeriod: true }).subject).toBe(
      "Betalingen er mottatt – Kaupet Proff er aktivt",
    );
    const renewal = proffPaidEmail({ ...base, firstPeriod: false });
    expect(renewal.subject).toBe("Betaling mottatt for Kaupet Proff");
    expect(renewal.text).toContain("Sendes senest 20. oktober 2027, forfall 3. november 2027");
  });

  it("oppsigelse sier når Proff slutter og at den kan angres", () => {
    const email = proffCancelledEmail({
      ...org,
      cancelledAt: "2026-11-20T10:00:00.000Z",
      accessUntil: "2026-12-03T10:00:00.000Z",
      sentInvoiceNumber: null,
    });
    expect(email.subject).toBe("Oppsigelsen av Kaupet Proff er bekreftet");
    expect(email.text).toContain("til 3. desember 2026");
    expect(email.text).toContain("fortsette abonnementet i bedriftskonsollet");
    expect(email.text).not.toContain("kreditnota");
  });
});
