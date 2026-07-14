import { describe, expect, it } from "vitest";

import { validateModules } from "./validators";

describe("validateModules", () => {
  it("returns null when no module key is registered", () => {
    expect(validateModules(["generic-attributes"], {})).toBeNull();
  });

  it("ignores unknown module keys", () => {
    expect(validateModules(["not-a-real-module"], {})).toBeNull();
  });
});
