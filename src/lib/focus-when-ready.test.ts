// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusWhenReady } from "./focus-when-ready";

function makeInput() {
  const input = document.createElement("input");
  // jsdom har ingen layout: stub synlighet.
  input.getClientRects = () => [{}] as unknown as DOMRectList;
  input.scrollIntoView = vi.fn();
  return input;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("focusWhenReady", () => {
  it("fokuserer et synlig element synkront", () => {
    const input = makeInput();
    document.body.append(input);
    focusWhenReady(() => input);
    expect(document.activeElement).toBe(input);
  });

  it("fokuserer et element som monteres senere", async () => {
    const input = makeInput();
    focusWhenReady(() => document.body.querySelector("input"));
    expect(document.activeElement).not.toBe(input);
    document.body.append(input);
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("gir opp etter timeout uten å fokusere senere", async () => {
    vi.useFakeTimers();
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    focusWhenReady(() => document.body.querySelector("input"), { timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    expect(disconnect).toHaveBeenCalled();
    const input = makeInput();
    document.body.append(input);
    await Promise.resolve();
    expect(document.activeElement).not.toBe(input);
    disconnect.mockRestore();
  });
});
