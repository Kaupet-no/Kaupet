// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComposerReview, ComposerReviewStatuses } from "./composer-review";

describe("ComposerReview", () => {
  it("viser forståelige verdier og lar brukeren endre riktig seksjon", () => {
    const onEdit = vi.fn();
    render(
      <ComposerReview items={[{ key: "title", label: "Tittel", value: "Trek sykkel", onEdit }]} />,
    );

    expect(screen.getByText("Trek sykkel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Endre" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

describe("ComposerReviewStatuses", () => {
  it("skiller krav fra anbefalinger og tilbyr direkte retting", () => {
    const onFix = vi.fn();
    render(
      <ComposerReviewStatuses
        items={[
          {
            key: "material",
            label: "Materiale",
            classification: "requiredToPublish",
            onAction: onFix,
          },
          {
            key: "photos",
            label: "Legg til bilder",
            classification: "recommendedForTrust",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Må fylles ut (1)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Anbefales (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fiks dette" }));
    expect(onFix).toHaveBeenCalledOnce();
  });
});
