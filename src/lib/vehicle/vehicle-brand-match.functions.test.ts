import { describe, expect, it } from "vitest";

import { findModelContainedIn } from "@/lib/vehicle/vehicle-brand-match.functions";

const model = (name: string, id = name) => ({ id, name, class_id: null });

describe("findModelContainedIn", () => {
  it("returns the base model when the SVV text carries a trim/variant suffix", () => {
    const models = [model("Leaf")];
    expect(findModelContainedIn(models, "Leaf 30kWh")).toEqual(model("Leaf"));
  });

  it("prefers the leftmost match over a longer later match", () => {
    const models = [model("A3"), model("e-tron")];
    expect(findModelContainedIn(models, "A3 Sportback e-tron")).toEqual(model("A3"));
  });

  it("falls back to the longer, more specific name on a tie", () => {
    const models = [model("A3"), model("A35")];
    expect(findModelContainedIn(models, "A35 Sportback")).toEqual(model("A35"));
  });

  it("does not match a name that is only a substring of a larger word", () => {
    const models = [model("A3")];
    expect(findModelContainedIn(models, "A35 Sportback")).toBeNull();
  });

  it("returns null when no model name appears in the text", () => {
    const models = [model("Golf"), model("Polo")];
    expect(findModelContainedIn(models, "Corolla Hybrid")).toBeNull();
  });

  it("skips blank model names", () => {
    const models = [model(""), model("Golf")];
    expect(findModelContainedIn(models, "Golf GTE 1.4")).toEqual(model("Golf"));
  });

  it("preserves class_id on the returned row", () => {
    const models = [{ id: "1", name: "C 200", class_id: "class-1" }];
    expect(findModelContainedIn(models, "C 200 4MATIC")).toEqual({
      id: "1",
      name: "C 200",
      class_id: "class-1",
    });
  });
});
