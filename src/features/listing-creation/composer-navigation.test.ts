import { describe, expect, it } from "vitest";

import { composerForwardStep } from "./composer-navigation";

describe("composerForwardStep", () => {
  it("returns to review after editing a review section", () => {
    expect(composerForwardStep(2, 5, true)).toBe(5);
    expect(composerForwardStep(2, 5, false)).toBe(2);
  });
});
