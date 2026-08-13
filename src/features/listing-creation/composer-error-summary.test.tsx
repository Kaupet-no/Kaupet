// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ComposerErrorSummary } from "./composer-error-summary";

describe("ComposerErrorSummary", () => {
  it("announces and focuses the current validation error", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });

    render(<ComposerErrorSummary message="Fyll inn tittelen før du fortsetter." />);

    const summary = screen.getByRole("alert");
    expect(summary.textContent).toContain("Fyll inn tittelen før du fortsetter.");
    expect(document.activeElement).toBe(summary);
  });
});
