import { describe, expect, it } from "vitest";

import { MODULE_VALIDATORS, validateModules } from "./validators";

describe("MODULE_VALIDATORS['vehicle-lookup']", () => {
  const validate = MODULE_VALIDATORS["vehicle-lookup"];

  it("passes when not registered", () => {
    expect(validate({})).toBeNull();
  });

  it("passes when registered with a registration number", () => {
    expect(validate({ is_registered: true, registration_number: "AB12345" })).toBeNull();
  });

  it("fails when registered without a registration number", () => {
    expect(validate({ is_registered: true })).not.toBeNull();
  });
});

describe("validateModules", () => {
  it("returns null when no module key is registered", () => {
    expect(validateModules(["generic-attributes"], {})).toBeNull();
  });

  it("returns the first error from an active module", () => {
    expect(validateModules(["vehicle-lookup"], { is_registered: true })).toEqual(
      expect.any(String),
    );
  });

  it("ignores unknown module keys", () => {
    expect(validateModules(["not-a-real-module"], {})).toBeNull();
  });
});
