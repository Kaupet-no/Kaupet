// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ListingCard } from "./listing-card";
import type { ListingCardData } from "@/lib/listing-card-data";
import { ListingCardExpanded } from "./listing-card-expanded";
import { ListingCardImages } from "./listing-card-images";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/favorite-button", () => ({ FavoriteButton: () => null }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-listing-gallery-images", () => ({
  useListingGalleryImages: () => ({ images: [], imgUrls: {}, isLoading: false }),
}));

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

const listing: ListingCardData = {
  id: "listing-1",
  kaupet_code: "ABC123",
  title: "Volvo V90",
  subtitle: "D4 AWD",
  price_nok: 250_000,
  is_free: false,
  city: "Oslo",
  created_at: "2026-08-23T00:00:00Z",
  cover_path: null,
  total_views: 9_876,
  views_last_week: 123,
  mileage_km: 85_000,
};

describe("offentlige annonsekort", () => {
  it("bevarer annonsemetadata uten å vise selgerens visningstall", () => {
    render(
      <>
        <ListingCard listing={listing} />
        <ListingCardExpanded listing={listing} />
      </>,
    );

    expect(screen.getAllByText("Volvo V90")).toHaveLength(2);
    expect(screen.getAllByText("250 000 kr")).toHaveLength(2);
    expect(screen.getAllByText("Oslo")).toHaveLength(2);
    expect(screen.getAllByText("85 000 km")).toHaveLength(2);
    expect(screen.queryByText("9 876")).toBeNull();
    expect(screen.queryByText(/siste syv dager/)).toBeNull();
  });

  it("viser at selgeroppgitt bildelkompatibilitet", () => {
    render(
      <ListingCard
        listing={{
          ...listing,
          attributes: {
            part_fitment_scope: "specific",
            part_fitment_vehicle_ids: ["model-1"],
          },
        }}
      />,
    );

    expect(screen.getByText("Selger oppgir 1 kompatibel bilmodell")).toBeTruthy();
  });

  it("viser Solgt-merke og Solgt som pris for nylig solgte annonser", () => {
    const sold = { ...listing, sold_at: "2026-10-01T12:00:00Z" };
    render(
      <>
        <ListingCard listing={sold} />
        <ListingCard listing={sold} compact />
        <ListingCardExpanded listing={sold} />
        <ListingCardImages listing={sold} />
      </>,
    );

    // Båndet og prisen: «Solgt» i DOM-en, store bokstaver bare via CSS.
    expect(screen.getAllByText("Solgt")).toHaveLength(8);
    expect(screen.queryByText("SOLGT")).toBeNull();
    expect(screen.queryByText("250 000 kr")).toBeNull();
  });
});
