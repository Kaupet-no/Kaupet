import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pathFromPublicImageUrl, publicImageUrl } from "./image-url";

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

describe("pathFromPublicImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returnerer stien for en URL som matcher basen", () => {
    expect(pathFromPublicImageUrl("https://bilder.kaupet.no/annonser/1/bilde.jpg")).toBe(
      "annonser/1/bilde.jpg",
    );
  });

  it("returnerer null for en URL utenfor basen", () => {
    expect(pathFromPublicImageUrl("https://annen-host.no/annonser/1/bilde.jpg")).toBeNull();
  });

  it("returnerer null når base-URL mangler", () => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "");
    expect(pathFromPublicImageUrl("https://bilder.kaupet.no/annonser/1/bilde.jpg")).toBeNull();
  });
});
