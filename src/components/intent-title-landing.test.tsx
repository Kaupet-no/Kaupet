// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IntentTitleLanding } from "./intent-title-landing";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  prefetchCategorySuggestion: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/category-suggestion.functions", () => ({
  prefetchCategorySuggestion: mocks.prefetchCategorySuggestion,
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.prefetchCategorySuggestion.mockReset();
});

describe("IntentTitleLanding", () => {
  it("viser tre eksplisitte valg for annonseintensjon som radioknapper", () => {
    render(<IntentTitleLanding />);

    const group = screen.getByRole("radiogroup", { name: "Jeg ønsker å" });
    const sell = screen.getByRole("radio", { name: "Selge" });
    const buy = screen.getByRole("radio", { name: "Ønskes kjøpt" });
    const free = screen.getByRole("radio", { name: "Gi bort" });
    expect(group.contains(sell)).toBe(true);
    expect(group.contains(buy)).toBe(true);
    expect(group.contains(free)).toBe(true);
    expect(sell.getAttribute("aria-checked")).toBe("true");
    expect(buy.getAttribute("aria-checked")).toBe("false");
  });

  it("bytter intensjon og navigasjonsmål ved klikk på et annet valg", () => {
    render(<IntentTitleLanding />);

    fireEvent.click(screen.getByRole("radio", { name: "Ønskes kjøpt" }));
    expect(screen.getByRole("radio", { name: "Ønskes kjøpt" }).getAttribute("aria-checked")).toBe(
      "true",
    );

    const input = screen.getByRole("textbox", { name: "Tittel på annonsen" });
    fireEvent.change(input, { target: { value: "sykkel" } });
    fireEvent.submit(input.closest("form")!);

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/ny-ok-annonse",
      search: { title: "sykkel" },
    });
  });

  it("har en synlig etikett som peker til tittel-feltet", () => {
    render(<IntentTitleLanding />);

    const input = screen.getByRole("textbox", { name: "Tittel på annonsen" });
    expect(screen.getByText("Tittel på annonsen")).toBeTruthy();
    expect(input.getAttribute("id")).toBe("listing-title");
  });

  it("beholder fem-tegnsgrensen for selge og starter ikke navigering ved kort tittel", () => {
    render(<IntentTitleLanding />);

    const input = screen.getByRole("textbox", { name: "Tittel på annonsen" });
    fireEvent.change(input, { target: { value: "abcd" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Tittelen må være minst 5 tegn")).toBeTruthy();
    expect(mocks.prefetchCategorySuggestion).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("beholder kjøpe-intent med tre-tegnsgrense og tekstbasert kategoriforslag", () => {
    render(<IntentTitleLanding defaultIntent="buy" />);

    const input = screen.getByRole("textbox", { name: "Tittel på annonsen" });
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Tittelen må være minst 3 tegn")).toBeTruthy();
    expect(mocks.prefetchCategorySuggestion).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "sykkel" } });
    fireEvent.submit(input.closest("form")!);

    expect(mocks.prefetchCategorySuggestion).toHaveBeenCalledWith("sykkel");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/ny-ok-annonse",
      search: { title: "sykkel" },
    });
  });

  it("beholder gi bort-intent med fem-tegnsgrense", () => {
    render(<IntentTitleLanding defaultIntent="free" />);

    const input = screen.getByRole("textbox", { name: "Tittel på annonsen" });
    fireEvent.change(input, { target: { value: "stol" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Tittelen må være minst 5 tegn")).toBeTruthy();
    fireEvent.change(input, { target: { value: "stolpe" } });
    fireEvent.submit(input.closest("form")!);

    expect(mocks.prefetchCategorySuggestion).toHaveBeenCalledWith("stolpe");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/ny-annonse",
      search: { type: "free", title: "stolpe" },
    });
  });
});
