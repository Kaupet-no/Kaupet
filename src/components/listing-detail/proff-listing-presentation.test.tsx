// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProffListingHeader, ProffRelatedListings } from "./proff-listing-presentation";
import type { ProffOrganizationPresentation } from "./proff-listing-types";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/mock">{children}</a>,
}));
vi.mock("@/components/listing-card", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => <article>{listing.title}</article>,
}));

const organization: ProffOrganizationPresentation = {
  id: "org-1",
  displayName: "HAPPY PIXEL AS",
  logoUrl: null,
  websiteUrl: "https://happypixel.example/",
  palette: "forest",
};

const listing = {
  id: "listing-1",
  kaupet_code: "12345678",
  title: "Kamera med stativ",
  price_nok: 1200,
  is_free: false,
  city: "Oslo",
  created_at: "2026-08-23T00:00:00Z",
  cover_path: null,
};

afterEach(cleanup);

describe("Proff-presentasjon", () => {
  it("viser bedrift, nettside og valgt visuell retning i alle tre forslag", () => {
    const { rerender } = render(
      <ProffListingHeader organization={organization} concept="signatur" />,
    );

    for (const concept of ["signatur", "redaksjonell", "butikk"] as const) {
      rerender(<ProffListingHeader organization={organization} concept={concept} />);
      expect(screen.getByText("HAPPY PIXEL AS")).toBeTruthy();
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByRole("link", { name: /Besøk nettsiden/ }).getAttribute("href")).toBe(
        "https://happypixel.example/",
      );
    }
  });

  it("viser et utvalg annonser og lenken med bedriftens visningsnavn", () => {
    render(
      <ProffRelatedListings
        organization={organization}
        concept="signatur"
        listings={[listing]}
        loading={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Flere annonser fra HAPPY PIXEL AS" })).toBeTruthy();
    expect(screen.getByText("Kamera med stativ")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Se alle annonser fra HAPPY PIXEL AS" })).toBeTruthy();
  });

  it("beholder bedriftslenken når det ikke finnes andre aktive annonser", () => {
    render(
      <ProffRelatedListings
        organization={organization}
        concept="butikk"
        listings={[]}
        loading={false}
      />,
    );

    expect(screen.getByText("Bedriften har ingen andre aktive annonser akkurat nå.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Se alle annonser fra HAPPY PIXEL AS" })).toBeTruthy();
  });

  it("viser opplastet logo når bedriften har en", () => {
    render(
      <ProffListingHeader
        organization={{ ...organization, logoUrl: "https://example.com/logo.png" }}
        concept="redaksjonell"
      />,
    );

    expect(screen.getByRole("img", { name: "Logo for HAPPY PIXEL AS" }).getAttribute("src")).toBe(
      "https://example.com/logo.png",
    );
  });
});
