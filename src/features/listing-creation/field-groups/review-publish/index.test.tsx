// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { PublishActions, ReviewPublishGroup } from ".";

const categoryFilters = vi.hoisted(() => ({
  current: [] as import("@/lib/category-filters").CategoryFilter[],
}));
const turnstileOptions = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
}));

vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ options }: { options: Record<string, unknown> }) => {
    turnstileOptions.current = options;
    return null;
  },
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

    expect(screen.getByText("1 opplysning må fylles ut")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tittelen må være minst 5 tegn" })).toBeTruthy();
    expect(screen.queryByText("Klar til publisering")).toBeNull();

    rerender(view([]));
    expect(screen.getByText("Klar til publisering")).toBeTruthy();
    expect(screen.getByText("Legg til bilder, så finner flere den")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publiser" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("viser annonsesiden fra ny-annonse.tsx som selve Se over-visningen", () => {
    render(
      <ReviewPublishGroup
        {...({
          native: false,
          isVehicle: false,
          attributes: {},
          mutationIsPending: false,
          uploadProgress: null,
          improvementGroupKeys: [],
          publishingRequirementErrors: [],
          reviewListing: <p>Annonsesiden</p>,
        } as unknown as WizardSharedProps)}
      />,
    );

    expect(screen.getByText("Annonsesiden")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Se full forhåndsvisning" })).toBeNull();
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
          improvementGroupKeys: ["photos", "vehicle-price", "location", "vehicle-360"],
          publishingRequirementErrors: [],
        } as unknown as WizardSharedProps)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ta 360°-opptak" }));

    expect(await screen.findByText("360°-opptaket er åpnet")).toBeTruthy();
  });
});

describe("PublishActions", () => {
  it.each([false, true])(
    "viser Turnstile-utfordringen bare når brukerinteraksjon kreves",
    (native) => {
      render(
        <PublishActions
          native={native}
          turnstileEnabled
          turnstileRef={{ current: null }}
          mutationIsPending={false}
          onCancel={vi.fn()}
        />,
      );

      expect(turnstileOptions.current).toEqual({
        appearance: "interaction-only",
        action: "kaupet",
      });
    },
  );
});
