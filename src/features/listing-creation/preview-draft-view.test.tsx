// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ListingEditContextValue } from "@/features/listing-edit/edit-mode-context";
import { EditableListingReview, PhoneListingPreview } from "./preview-draft-view";

const wide = vi.hoisted(() => ({ current: true }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => wide.current }));
vi.mock("@/components/listing-detail/listing-detail-view", () => ({
  ListingDetailView: ({
    listingStatus,
    categoryId,
    phonePreview,
    editMode,
  }: {
    listingStatus?: string | null;
    categoryId?: string | null;
    phonePreview?: boolean;
    editMode?: unknown;
  }) => (
    <p>
      Status: {listingStatus}, categoryId: {categoryId ?? "null"}, layout:{" "}
      {phonePreview ? "mobil" : "desktop"}
      {editMode ? ", redigerbar" : ""}
    </p>
  ),
}));

afterEach(() => {
  cleanup();
  wide.current = true;
});

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

describe("PhoneListingPreview", () => {
  it("viser forhåndsvisningen som kladd i mobilversjon", () => {
    render(<PhoneListingPreview draft={{ ...baseDraft, categoryId: null }} />);

    expect(screen.getByText(/Status: draft, categoryId: null, layout: mobil/)).toBeTruthy();
  });

  // Regresjonstest for F5: GenericAttributesGrid (og kjøretøy-/båtgridene)
  // rendres kun når ListingDetailView får en sann `categoryId`-prop.
  // Forhåndsvisningen glemte tidligere å sende den videre fra draften, så
  // Egenskaper-seksjonen manglet selv om annonsen hadde kategoriattributter.
  it("sender categoryId videre til ListingDetailView slik at Egenskaper vises", () => {
    render(<PhoneListingPreview draft={{ ...baseDraft, categoryId: "cat-sofa" }} />);

    expect(screen.getByText(/categoryId: cat-sofa/)).toBeTruthy();
  });
});

describe("EditableListingReview", () => {
  const renderReview = (native = false) => {
    const onEditImages = vi.fn();
    render(
      <EditableListingReview
        draft={{ ...baseDraft, categoryId: "cat-sofa" }}
        editContext={{} as ListingEditContextValue}
        native={native}
        onEditImages={onEditImages}
      />,
    );
    return { onEditImages };
  };

  it("viser desktopversjonen som standard og bytter til mobil i rammen", () => {
    renderReview();

    expect(screen.getByText(/layout: desktop, redigerbar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mobil" }));
    expect(screen.getByText(/layout: mobil, redigerbar/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mobil" }).getAttribute("aria-pressed")).toBe("true");
  });

  it.each([
    ["på smale skjermer", false, false],
    ["i appen", true, true],
  ])("viser bare mobilversjonen, uten bryter, %s", (_label, isWide, native) => {
    wide.current = isWide;
    renderReview(native);

    expect(screen.getByText(/layout: mobil, redigerbar/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Vis annonsen som" })).toBeNull();
  });

  it("sender «Endre bilder» tilbake til bildesteget", () => {
    const { onEditImages } = renderReview();

    fireEvent.click(screen.getByRole("button", { name: "Endre bilder" }));
    expect(onEditImages).toHaveBeenCalledOnce();
  });
});
