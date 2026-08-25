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
  it("viser informasjon om automatisk tittel bak en info-knapp", () => {
    render(<IntentTitleLanding />);

    const infoButton = screen.getByRole("button", { name: "Informasjon om automatisk tittel" });
    expect(screen.getByText("Dette blir tittelen på annonsen din")).toBeTruthy();
    expect(infoButton.getAttribute("title")).toBe(
      "For Bil, MC og Båt genereres tittelen automatisk",
    );
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
