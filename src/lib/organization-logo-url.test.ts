import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicUrlMock } = vi.hoisted(() => ({
  getPublicUrlMock: vi.fn((path: string) => ({
    data: {
      publicUrl: `https://supabase.example/storage/v1/object/public/organization-logos/${path}`,
    },
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: getPublicUrlMock }) } },
}));

import { organizationLogoUrl } from "./organization-logo-url";

describe("organizationLogoUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    getPublicUrlMock.mockClear();
  });

  it("returnerer null for manglende sti", () => {
    expect(organizationLogoUrl(null)).toBeNull();
    expect(organizationLogoUrl(undefined)).toBeNull();
    expect(organizationLogoUrl("")).toBeNull();
  });

  it("bruker Supabase sin getPublicUrl for en gammel siffer-sti", () => {
    const path = "org-1/logo-1717000000000.jpg";
    expect(organizationLogoUrl(path)).toBe(
      `https://supabase.example/storage/v1/object/public/organization-logos/${path}`,
    );
    expect(getPublicUrlMock).toHaveBeenCalledWith(path);
  });

  it("bruker R2 sin publicImageUrl for en ny uuid-sti", () => {
    const path = "org-1/logo-11111111-1111-1111-1111-111111111111.jpg";
    expect(organizationLogoUrl(path)).toBe(`https://bilder.kaupet.no/${path}`);
    expect(getPublicUrlMock).not.toHaveBeenCalled();
  });
});
