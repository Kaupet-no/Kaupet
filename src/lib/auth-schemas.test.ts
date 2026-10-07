import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema } from "./auth-schemas";

// AUTH-02: shared signup/reset/account schemas keep the same boundaries.
describe("auth-schemas", () => {
  it("godtar ti tegn i passordet og avviser ni", () => {
    expect(passwordSchema.safeParse("x".repeat(10)).success).toBe(true);
    const result = passwordSchema.safeParse("x".repeat(9));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Minst 10 tegn");
  });

  it.each(["", null, undefined, 123, []])("avviser ugyldig passord (%s)", (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it("beholder norske tegn og emoji i passordet", () => {
    expect(passwordSchema.parse("Sikker-æøå-🚲-123")).toBe("Sikker-æøå-🚲-123");
  });

  it("normaliserer omkringliggende mellomrom i e-post", () => {
    expect(emailSchema.parse("  bruker@example.com  ")).toBe("bruker@example.com");
  });

  it.each(["", "   "])("forklarer at e-postfeltet er tomt (%s)", (value) => {
    const result = emailSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Fyll inn e-postadressen din");
  });

  it.each(["ugyldig", "bruker@", null, undefined, 123, []])(
    "avviser ugyldig e-post (%s)",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );
});
