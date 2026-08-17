// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComposerReview } from "./composer-review";

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
