// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewDraftView } from "./preview-draft-view";

vi.mock("@/components/listing-detail/listing-detail-view", () => ({
  ListingDetailView: ({ listingStatus }: { listingStatus?: string | null }) => (
    <p>Status: {listingStatus}</p>
  ),
}));

afterEach(cleanup);

describe("PreviewDraftView", () => {
  it("viser forhåndsvisningen som kladd, ikke som publisert annonse", () => {
    render(
      <PreviewDraftView
        draft={{
          title: "Brun skinnsofa",
          subtitle: null,
          description: "Pent brukt.",
          priceNok: 5000,
          isFree: false,
          condition: "good",
          canShip: false,
          requiresDeliveryMethod: true,
          city: "Oslo",
          postalCode: "0001",
          displayLat: null,
          displayLng: null,
          knownIssues: null,
          noKnownIssues: null,
          maintenanceHistory: null,
          category: { name_nb: "Sofa", slug: "sofa" },
          images: [],
          imgUrls: {},
          attributes: {},
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Status: draft")).toBeTruthy();
  });
});
