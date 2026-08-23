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
  it("viser tittelunntaket uten hover", () => {
    render(<IntentTitleLanding />);

    expect(screen.getByText(/For Bil og MC og Båt genereres tittelen automatisk/)).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
