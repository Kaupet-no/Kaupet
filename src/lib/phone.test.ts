import { describe, expect, it } from "vitest";

import { formatPhone, normalizePhone, phoneHref } from "@/lib/phone";

describe("phone", () => {
  it("normaliserer vanlige skrivemåter og avviser ugyldige nummer", () => {
    expect(normalizePhone("123 45 678")).toBe("12345678");
    expect(normalizePhone("0047 123-45-678")).toBe("+4712345678");
    expect(normalizePhone("(+47) 12345678")).toBe("+4712345678");
    expect(normalizePhone("1234567")).toBeNull();
    expect(normalizePhone("12a45678")).toBeNull();
  });

  it("formaterer norske nummer og lager tel-lenke med landskode", () => {
    expect(formatPhone("12345678")).toBe("123 45 678");
    expect(formatPhone("+4712345678")).toBe("+47 123 45 678");
    expect(formatPhone("+46701234567")).toBe("+46701234567");
    expect(phoneHref("12345678")).toBe("tel:+4712345678");
    expect(phoneHref("+46701234567")).toBe("tel:+46701234567");
  });
});
