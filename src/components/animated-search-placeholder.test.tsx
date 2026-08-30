// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder";

afterEach(cleanup);

describe("AnimatedSearchPlaceholder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("kryssfader gjennom ordene når redusert bevegelse ikke er satt", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<AnimatedSearchPlaceholder words={["sofa", "sykkel"]} hold={100} fade={10} />);
    expect(screen.getByText("sofa")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText("sykkel")).toBeTruthy();
  });

  it("fryser på første ord og dropper opacity-transition ved redusert bevegelse", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<AnimatedSearchPlaceholder words={["sofa", "sykkel"]} hold={100} fade={10} />);
    expect(screen.getByText("sofa")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Aldri byttet til "sykkel" — intervallet startes aldri ved redusert bevegelse.
    expect(screen.getByText("sofa")).toBeTruthy();
    expect(screen.queryByText("sykkel")).toBeNull();
    expect(screen.getByText("sofa").className).not.toContain("transition-opacity");
  });
});
