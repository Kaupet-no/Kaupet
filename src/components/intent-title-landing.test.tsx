// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntentTitleLanding } from "./intent-title-landing";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/category-suggestion.functions", () => ({
  prefetchCategorySuggestion: vi.fn(),
}));

afterEach(cleanup);

describe("IntentTitleLanding", () => {
  it("viser informasjon om automatisk tittel bak en info-knapp", () => {
    render(<IntentTitleLanding />);

    const infoButton = screen.getByRole("button", { name: "Informasjon om automatisk tittel" });
    expect(screen.getByText("Dette blir tittelen på annonsen din")).toBeTruthy();
    expect(infoButton.getAttribute("title")).toBe(
      "For Bil, MC og Båt genereres tittelen automatisk",
    );
  });
});
