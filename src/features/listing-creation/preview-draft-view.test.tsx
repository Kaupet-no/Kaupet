// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewDraftView } from "./preview-draft-view";

vi.mock("@/components/listing-detail/listing-detail-view", () => ({
  ListingDetailView: ({
    listingStatus,
    categoryId,
  }: {
    listingStatus?: string | null;
    categoryId?: string | null;
  }) => (
    <p>
      Status: {listingStatus}, categoryId: {categoryId ?? "null"}
    </p>
  ),
}));

afterEach(cleanup);

const baseDraft = {
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
};

describe("PreviewDraftView", () => {
  it("viser forhåndsvisningen som kladd, ikke som publisert annonse", () => {
    render(<PreviewDraftView draft={{ ...baseDraft, categoryId: null }} onClose={vi.fn()} />);

    expect(screen.getByText("Status: draft, categoryId: null")).toBeTruthy();
  });

  // Regresjonstest for F5: GenericAttributesGrid (og kjøretøy-/båtgridene)
  // rendres kun når ListingDetailView får en sann `categoryId`-prop.
  // PreviewDraftView glemte tidligere å sende den videre fra draften, så
  // Egenskaper-seksjonen manglet i forhåndsvisningen selv om annonsen hadde
  // kategoriattributter.
  it("sender categoryId videre til ListingDetailView slik at Egenskaper vises", () => {
    render(<PreviewDraftView draft={{ ...baseDraft, categoryId: "cat-sofa" }} onClose={vi.fn()} />);

    expect(screen.getByText("Status: draft, categoryId: cat-sofa")).toBeTruthy();
  });
});
