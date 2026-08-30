// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "./use-reduced-motion";

let listeners: Array<() => void> = [];
let currentMatches = false;

function mockMatchMedia() {
  listeners = [];
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() {
      return currentMatches;
    },
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      listeners = listeners.filter((l) => l !== cb);
    },
  });
}

function fireChange(matches: boolean) {
  currentMatches = matches;
  for (const cb of listeners) cb();
}

function Probe() {
  const reduced = useReducedMotion();
  return <span data-testid="reduced">{String(reduced)}</span>;
}

afterEach(cleanup);
beforeEach(() => {
  currentMatches = false;
  mockMatchMedia();
});

describe("useReducedMotion", () => {
  it("leser gjeldende systeminnstilling ved mount", () => {
    currentMatches = true;
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("true");
  });

  it("returnerer false som standard når brukeren ikke ber om redusert bevegelse", () => {
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");
  });

  it("oppdaterer når systeminnstillingen endres mens appen er åpen", () => {
    render(<Probe />);
    expect(screen.getByTestId("reduced").textContent).toBe("false");
    act(() => fireChange(true));
    expect(screen.getByTestId("reduced").textContent).toBe("true");
  });

  it("fjerner lytteren ved unmount", () => {
    const { unmount } = render(<Probe />);
    expect(listeners).toHaveLength(1);
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
