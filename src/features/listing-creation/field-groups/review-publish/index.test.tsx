// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { PublishActions, ReviewPreview, ReviewPublishGroup } from ".";

const categoryFilters = vi.hoisted(() => ({
  current: [] as import("@/lib/category-filters").CategoryFilter[],
}));

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: () => vi.fn().mockResolvedValue({ token: "test-token" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-category-filters", () => ({
  useAllCategoryFilters: () => ({ data: categoryFilters.current }),
}));
vi.mock("@/features/vehicle-360-capture/capture-flow", () => ({
  Vehicle360CaptureFlow: () => <p>360°-opptaket er åpnet</p>,
}));
afterEach(cleanup);

describe("ReviewPublishGroup", () => {
  afterEach(() => {
    categoryFilters.current = [];
  });

  it("viser harde publiseringskrav separat og lar anbefalinger passeres når kravene er oppfylt", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const view = (publishingRequirementErrors: string[]) => (
      <form onSubmit={onSubmit}>
        <ReviewPublishGroup
          {...({
            native: true,
            isVehicle: false,
            behavior: { requiresDeliveryMethod: false },
            categories: [],
            categoryId: "",
            images: [],
            title: "Kort",
            subtitle: undefined,
            previewPrice: null,
            city: undefined,
            postalCode: undefined,
            categoryLabel: "Møbler",
            attributes: {},
            mutationIsPending: false,
            uploadProgress: null,
            improvementGroupKeys: ["photos", "price", "location"],
            publishingRequirementErrors,
            onEditReviewSection: vi.fn(),
          } as unknown as WizardSharedProps)}
        />
        <PublishActions
          native
          turnstileEnabled={false}
          turnstileRef={{ current: null }}
          mutationIsPending={false}
          onCancel={vi.fn()}
        />
      </form>
    );
    const { rerender } = render(view(["Tittelen må være minst 5 tegn"]));

    expect(screen.getByRole("heading", { name: "Publiseringsklar" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Tittelen må være minst 5 tegn");
    expect(screen.getByRole("heading", { name: "Gjør annonsen bedre" })).toBeTruthy();
    expect(screen.getByText("Legg til bilder")).toBeTruthy();

    rerender(view([]));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publiser" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("åpner 360° som valgfri forbedring fra kjøretøyets review", async () => {
    render(
      <ReviewPublishGroup
        {...({
          native: true,
          isVehicle: true,
          behavior: { requiresDeliveryMethod: false },
          categories: [],
          categoryId: "",
          images: [],
          title: "Volvo V70",
          subtitle: undefined,
          previewPrice: null,
          city: undefined,
          postalCode: undefined,
          categoryLabel: "Bil",
          attributes: {},
          mutationIsPending: false,
          uploadProgress: null,
          draftId: "draft-1",
          ensureDraftId: vi.fn(),
          onEditReviewSection: vi.fn(),
          onPreview: vi.fn(),
          improvementGroupKeys: ["photos", "vehicle-price", "location", "vehicle-360"],
          publishingRequirementErrors: [],
        } as unknown as WizardSharedProps)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ta 360°-opptak" }));

    expect(await screen.findByText("360°-opptaket er åpnet")).toBeTruthy();
  });

  it("viser utfylt beskrivelse, kategoriattributter og levering i gjennomgangen", () => {
    categoryFilters.current = [
      {
        id: "material",
        category_id: "sofa",
        key: "material",
        label_nb: "Materiale",
        type: "select",
        unit: null,
        options: [{ value: "leather", label_nb: "Skinn" }],
        sort_order: 1,
        is_primary: true,
        depends_on_key: null,
        depends_on_value: null,
        depends_on_not_value: null,
        is_optional: false,
      },
      {
        id: "width",
        category_id: "sofa",
        key: "width_cm",
        label_nb: "Bredde",
        type: "number",
        unit: "cm",
        options: null,
        sort_order: 2,
        is_primary: false,
        depends_on_key: null,
        depends_on_value: null,
        depends_on_not_value: null,
        is_optional: true,
      },
    ];

    render(
      <ReviewPublishGroup
        {...({
          native: false,
          isVehicle: false,
          behavior: { requiresDeliveryMethod: true },
          categories: [{ id: "sofa", parent_id: null, name_nb: "Sofa" }],
          categoryId: "sofa",
          categoryLabel: "Møbler / Sofa",
          categorySlug: "sofa",
          images: [],
          title: "Brun skinnsofa",
          subtitle: undefined,
          description: "Pent brukt og uten skader.",
          previewPrice: "5 000 kr",
          priceNok: 5000,
          isFree: false,
          canShip: "pickup",
          city: "Oslo",
          postalCode: "0001",
          attributes: { material: "leather", width_cm: 210 },
          mutationIsPending: false,
          uploadProgress: null,
          improvementGroupKeys: [],
          publishingRequirementErrors: [],
          onEditReviewSection: vi.fn(),
        } as unknown as WizardSharedProps)}
      />,
    );

    expect(screen.getByText(/Beskrivelse: Pent brukt og uten skader\./)).toBeTruthy();
    expect(screen.getByText(/Materiale: Skinn/)).toBeTruthy();
    expect(screen.getByText(/Bredde: 210 cm/)).toBeTruthy();
    expect(screen.getByText(/Sted: 0001 Oslo/)).toBeTruthy();
    expect(screen.getByText(/Levering: Må hentes/)).toBeTruthy();
  });
});

describe("ReviewPreview", () => {
  it("viser en tilgjengelig tom forhåndsvisning uten å feile", () => {
    render(
      <ReviewPreview
        images={[]}
        title=""
        subtitle=""
        priceNok={undefined}
        isFree={false}
        city=""
        postalCode=""
        categorySlug={null}
        attributes={{}}
      />,
    );

    expect(screen.getByRole("region", { name: "Forhåndsvisning" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Forhåndsvisning" })).toBeTruthy();
    expect(screen.getAllByText("Ingen bilde").length).toBeGreaterThan(0);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Ingen pris")).toBeTruthy();
    expect(screen.getByRole("article").className).toContain("text-left");
    expect(screen.queryByText("Pris ved henvendelse")).toBeNull();
  });
  it("gjør hele forhåndsvisningskortet trykkbart med beskrivende navn", () => {
    const onPreview = vi.fn();
    render(
      <ReviewPreview
        images={[]}
        title="Volvo V90"
        subtitle=""
        priceNok={250_000}
        isFree={false}
        city="Oslo"
        postalCode=""
        categorySlug="bil"
        attributes={{}}
        onPreview={onPreview}
      />,
    );

    const previewButton = screen.getByRole("button", {
      name: "Trykk for å forhåndsvise annonsen",
    });
    fireEvent.click(previewButton);

    expect(onPreview).toHaveBeenCalledOnce();
    expect(screen.getByText("Trykk for å forhåndsvise annonsen")).toBeTruthy();
  });
  it("viser kjøretøyets pris inkludert omregistreringsavgift", () => {
    render(
      <ReviewPreview
        images={[]}
        title="Volvo V90"
        subtitle=""
        priceNok={250_000}
        isFree={false}
        city="Oslo"
        postalCode=""
        categorySlug="bil"
        attributes={{ omregistreringsavgift_override_kr: 5_000 }}
      />,
    );

    expect(screen.getByText("255 000 kr")).toBeTruthy();
  });
});
