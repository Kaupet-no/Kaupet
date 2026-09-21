// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComposerReviewStatuses } from "./composer-review";

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

    expect(screen.getByRole("heading", { name: "Dette må fylles ut (1)" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gjør annonsen bedre (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fiks dette" }));
    expect(onFix).toHaveBeenCalledOnce();
  });
});
