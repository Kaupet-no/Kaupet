import { describe, expect, it } from "vitest";

import { composerForwardStep, composerSwipeDirection } from "./composer-navigation";

describe("composerForwardStep", () => {
  it("returns to review after editing a review section", () => {
    expect(composerForwardStep(2, 5, true)).toBe(5);
    expect(composerForwardStep(2, 5, false)).toBe(2);
  });
});

describe("composerSwipeDirection", () => {
  it("godtar tydelige horisontale swipe i begge retninger", () => {
    expect(composerSwipeDirection(-80, 12)).toBe("forward");
    expect(composerSwipeDirection(80, -12)).toBe("back");
  });

  it("avviser korte og hovedsakelig vertikale bevegelser", () => {
    expect(composerSwipeDirection(-40, 0)).toBeNull();
    expect(composerSwipeDirection(-80, 70)).toBeNull();
  });
});
