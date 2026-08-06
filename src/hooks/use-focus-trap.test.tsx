// @vitest-environment jsdom
import { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

afterEach(cleanup);

function TestDialog({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref}>
      <button>First</button>
      <button>Last</button>
    </div>
  );
}

function fireTab(shiftKey: boolean) {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true });
  document.dispatchEvent(event);
  return event;
}

describe("useFocusTrap", () => {
  it("wraps Tab from the last focusable element back to the first", () => {
    const { getByText } = render(<TestDialog active />);
    const last = getByText("Last");
    const first = getByText("First");
    last.focus();

    act(() => {
      fireTab(false);
    });

    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    const { getByText } = render(<TestDialog active />);
    const first = getByText("First");
    const last = getByText("Last");
    first.focus();

    act(() => {
      fireTab(true);
    });

    expect(document.activeElement).toBe(last);
  });

  it("does nothing when inactive", () => {
    const { getByText } = render(<TestDialog active={false} />);
    const last = getByText("Last");
    last.focus();

    const event = fireTab(false);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(last);
  });
});
