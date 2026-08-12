// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { expandSheetBeforeScroll } from "./sheet-gestures";

describe("expandSheetBeforeScroll", () => {
  it("expands a partial sheet and keeps its content at the top", () => {
    const target = document.createElement("div");
    const expand = vi.fn();
    target.scrollTop = 12;

    expect(expandSheetBeforeScroll(target, false, expand)).toBe(true);
    expect(target.scrollTop).toBe(0);
    expect(expand).toHaveBeenCalledOnce();
  });

  it("leaves content scrolling alone after the sheet is expanded", () => {
    const target = document.createElement("div");
    const expand = vi.fn();
    target.scrollTop = 12;

    expect(expandSheetBeforeScroll(target, true, expand)).toBe(false);
    expect(target.scrollTop).toBe(12);
    expect(expand).not.toHaveBeenCalled();
  });
});
