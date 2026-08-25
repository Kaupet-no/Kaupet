// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { PublishActions, ReviewPreview, ReviewPublishGroup } from ".";

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: () => vi.fn().mockResolvedValue({ token: "test-token" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], refetch: vi.fn() }),
}));
vi.mock("@/features/vehicle-360-capture/capture-flow", () => ({
  Vehicle360CaptureFlow: () => <p>360°-opptaket er åpnet</p>,
}));

describe("ReviewPublishGroup", () => {
  it("viser harde publiseringskrav separat og lar anbefalinger passeres når kravene er oppfylt", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const view = (publishingRequirementErrors: string[]) => (
      <form onSubmit={onSubmit}>
        <ReviewPublishGroup
          {...({
            native: true,
            isVehicle: false,
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
          turnstileToken={null}
          setTurnstileToken={vi.fn()}
          mutationIsPending={false}
          onCancel={vi.fn()}
          onPreview={vi.fn()}
        />
      </form>
    );
    const { rerender } = render(view(["Tittelen må være minst 5 tegn"]));

    expect(screen.getByRole("heading", { name: "Publiseringsklar" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Tittelen må være minst 5 tegn");
    expect(screen.getByRole("heading", { name: "Dette vil gi en bedre annonse" })).toBeTruthy();
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

describe("ReviewPreview", () => {
  it("viser en tilgjengelig tom forhåndsvisning uten å feile", () => {
    render(
      <ReviewPreview
        images={[]}
        title=""
        subtitle=""
        previewPrice={null}
        city=""
        postalCode=""
        categoryLabel={null}
      />,
    );

    expect(screen.getByRole("region", { name: "Forhåndsvisning" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Forhåndsvisning" })).toBeTruthy();
    expect(screen.getAllByText("Ingen bilde").length).toBeGreaterThan(0);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
