import { describe, expect, it } from "vitest";

import { wtbSchema } from "@/routes/ny-ok-annonse";

const base = { title: "Ønskes kjøpt: brukt elsykkel" };

describe("wtbSchema.max_price_nok", () => {
  it("lar et tomt maks-prisfelt bli tomt, ikke 0", () => {
    // z.coerce.number() gjør "" til 0, så med tall-grenen først ble et
    // uutfylt (valgfritt) maksbeløp lagret som "maks 0 kr" — et kjøpsønske
    // ingen annonse kan matche.
    const parsed = wtbSchema.parse({ ...base, max_price_nok: "" });

    expect(parsed.max_price_nok).toBe("");
    expect(parsed.max_price_nok).not.toBe(0);
  });

  it("tolker fortsatt et utfylt beløp som tall", () => {
    expect(wtbSchema.parse({ ...base, max_price_nok: "15000" }).max_price_nok).toBe(15000);
    expect(wtbSchema.parse({ ...base, max_price_nok: 0 }).max_price_nok).toBe(0);
  });

  it("avviser desimaler og for høye beløp", () => {
    expect(wtbSchema.safeParse({ ...base, max_price_nok: "12.5" }).success).toBe(false);
    expect(wtbSchema.safeParse({ ...base, max_price_nok: "20000000" }).success).toBe(false);
  });
});
