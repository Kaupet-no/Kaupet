import { describe, expect, it } from "vitest";

import { summarizeCriteria } from "./saved-searches";

describe("saved search criteria", () => {
  it("viser at lagrede kriterier inkluderer kategoriattributter", () => {
    expect(
      summarizeCriteria({
        categories: ["bil"],
        attributes: {
          fuel_type: { kind: "select", value: "electric" },
          rear_camera: { kind: "boolean", value: true },
        },
      }),
    ).toContain("2 egenskaper");
  });
});
