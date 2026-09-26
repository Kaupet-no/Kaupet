// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ListingEditContextValue } from "@/features/listing-edit/edit-mode-context";
import { EditableListingReview, PhoneListingPreview } from "./preview-draft-view";

const wide = vi.hoisted(() => ({ current: true }));
const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  membership: null as unknown,
  profile: null as unknown,
}));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => wide.current }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock("@/features/business-account/use-business-membership", () => ({
  useBusinessMembership: () => ({ data: session.membership }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: session.profile }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/listing-detail/listing-detail-view", () => ({
  ListingDetailView: ({
    listingStatus,
    categoryId,
    phonePreview,
    editMode,
    sellerContactSlot,
    organizationBrand,
  }: {
    listingStatus?: string | null;
    categoryId?: string | null;
    phonePreview?: boolean;
    editMode?: unknown;
    sellerContactSlot?: React.ReactNode;
    organizationBrand?: { displayName: string; palette: string | null };
  }) => (
    <>
      <p>
        Status: {listingStatus}, categoryId: {categoryId ?? "null"}, layout:{" "}
        {phonePreview ? "mobil" : "desktop"}
        {editMode ? ", redigerbar" : ""}
      </p>
      {organizationBrand && (
        <p>
          Profilering: {organizationBrand.displayName} {organizationBrand.palette}
        </p>
      )}
      {sellerContactSlot}
    </>
  ),
}));

afterEach(() => {
  cleanup();
  wide.current = true;
  session.user = null;
  session.membership = null;
  session.profile = null;
});

const organization = {
  id: "org-1",
  organization_number: "123456789",
  display_name: "Bilhuset AS",
  selected_plan: "basis",
  proff_access_until: null,
  website_url: null,
  logo_path: null,
  brand_palette: "#224466",
  listing_concept: "signatur",
  listing_font: "inter",
  listing_overtitle: "annonse_fra",
};

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

  it("viser «Selger» når brukeren ikke er innlogget", () => {
    render(<PhoneListingPreview draft={{ ...baseDraft, categoryId: null }} />);

    expect(screen.getByText("Selger")).toBeTruthy();
    expect(screen.getByText("Privatperson")).toBeTruthy();
  });

  it("viser den innloggede brukerens profil", () => {
    session.user = { id: "u1" };
    session.profile = { display_name: "Kari", avatar_url: null, created_at: "2024-03-01" };
    render(<PhoneListingPreview draft={{ ...baseDraft, categoryId: null }} />);

    expect(screen.getByText("Kari")).toBeTruthy();
    expect(screen.getByText(/Medlem siden/)).toBeTruthy();
    expect(screen.queryByText("Selger")).toBeNull();
  });

  it("viser bedriftskontoen uten profilering når Proff ikke er aktiv", () => {
    session.user = { id: "u1" };
    session.membership = { organization };
    render(<PhoneListingPreview draft={{ ...baseDraft, categoryId: null }} />);

    expect(screen.getByText("Bilhuset AS")).toBeTruthy();
    expect(screen.getByText(/Org\.nr\./)).toBeTruthy();
    expect(screen.queryByText(/Profilering:/)).toBeNull();
  });

  it("viser Proff-profileringen når avtalen er aktiv", () => {
    session.user = { id: "u1" };
    session.membership = {
      organization: { ...organization, selected_plan: "proff", proff_access_until: "2999-01-01" },
    };
    render(<PhoneListingPreview draft={{ ...baseDraft, categoryId: null }} />);

    expect(screen.getByText("Profilering: Bilhuset AS #224466")).toBeTruthy();
    expect(screen.getByText("Selges av en bedrift")).toBeTruthy();
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
