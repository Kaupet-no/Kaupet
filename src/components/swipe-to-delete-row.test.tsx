// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwipeToDeleteRow } from "./swipe-to-delete-row";

afterEach(cleanup);

// jsdom doesn't implement pointer capture — stub it so the drag handler's
// setPointerCapture call doesn't throw and abort the event.
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

function drag(el: Element, dx: number) {
  fireEvent.pointerDown(el, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: dx, pointerId: 1 });
  fireEvent.pointerUp(el, { pointerId: 1 });
}

describe("SwipeToDeleteRow", () => {
  it("snaps back to closed when the drag doesn't pass the reveal threshold", () => {
    const onDelete = vi.fn();
    const { getByText } = render(
      <SwipeToDeleteRow onDelete={onDelete}>
        <div>row content</div>
      </SwipeToDeleteRow>,
    );
    const content = getByText("row content").parentElement!;

    drag(content, -20); // well under the ~35px threshold

    expect(content.style.transform).toBe("translateX(0px)");
  });

  it("snaps open when the drag passes the reveal threshold, revealing delete", () => {
    const onDelete = vi.fn();
    const { getByText, getByLabelText } = render(
      <SwipeToDeleteRow onDelete={onDelete}>
        <div>row content</div>
      </SwipeToDeleteRow>,
    );
    const content = getByText("row content").parentElement!;

    drag(content, -60); // past the ~35px threshold

    expect(content.style.transform).toBe("translateX(-88px)");

    fireEvent.click(getByLabelText("Slett"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("a plain tap while open closes the row instead of reaching content underneath", () => {
    const onDelete = vi.fn();
    const clickThrough = vi.fn();
    const { getByText } = render(
      <SwipeToDeleteRow onDelete={onDelete}>
        <button onClick={clickThrough}>row content</button>
      </SwipeToDeleteRow>,
    );
    const content = getByText("row content");

    drag(content.parentElement!, -60);
    expect(content.parentElement!.style.transform).toBe("translateX(-88px)");
    // A real drag-release also fires a trailing click for the same gesture —
    // that one gets swallowed (not "close", not "click through").
    fireEvent.click(content);
    expect(content.parentElement!.style.transform).toBe("translateX(-88px)");

    // A separate, later tap (no drag) while still open should close instead
    // of reaching the button underneath.
    fireEvent.click(content);

    expect(clickThrough).not.toHaveBeenCalled();
    expect(content.parentElement!.style.transform).toBe("translateX(0px)");
  });
});
