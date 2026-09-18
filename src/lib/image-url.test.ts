import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publicImageUrl } from "./image-url";

describe("publicImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("setter sammen base-URL og nøkkel", () => {
    expect(publicImageUrl("annonser/1/bilde.jpg")).toBe(
      "https://bilder.kaupet.no/annonser/1/bilde.jpg",
    );
  });

  it("fjerner ledende skråstrek i nøkkelen slik at det ikke blir dobbel skråstrek", () => {
    expect(publicImageUrl("/annonser/1/bilde.jpg")).toBe(
      "https://bilder.kaupet.no/annonser/1/bilde.jpg",
    );
  });

  it("håndterer base-URL med etterfølgende skråstrek", () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no/");
    expect(publicImageUrl("annonser/1/bilde.jpg")).toBe(
      "https://bilder.kaupet.no/annonser/1/bilde.jpg",
    );
  });

  it("kaster tydelig norsk feilmelding når R2_PUBLIC_BASE_URL mangler", () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "");
    expect(() => publicImageUrl("annonser/1/bilde.jpg")).toThrow("R2_PUBLIC_BASE_URL");
  });
});
