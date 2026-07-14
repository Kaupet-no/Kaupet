import { describe, expect, it } from "vitest";

import { validateRequiredFieldGroups } from "./validators";

describe("validateRequiredFieldGroups", () => {
  const DEFAULT_FLOW = [
    "title-photos",
    "category-attributes",
    "condition",
    "price",
    "delivery-location",
  ];

  it("passes for the default flow when both fields are set", () => {
    expect(
      validateRequiredFieldGroups(DEFAULT_FLOW, { condition: "good", can_ship: true }),
    ).toBeNull();
  });

  it("requires condition when the flow includes the condition group", () => {
    expect(validateRequiredFieldGroups(DEFAULT_FLOW, { condition: null, can_ship: true })).toEqual(
      expect.any(String),
    );
  });

  it("requires can_ship when the flow includes the delivery-location group", () => {
    expect(
      validateRequiredFieldGroups(DEFAULT_FLOW, { condition: "good", can_ship: null }),
    ).toEqual(expect.any(String));
  });

  it("allows condition: null when the flow omits the condition group", () => {
    const flow = DEFAULT_FLOW.filter((k) => k !== "condition");
    expect(validateRequiredFieldGroups(flow, { condition: null, can_ship: true })).toBeNull();
  });

  it("allows can_ship: null when the flow omits the delivery-location group", () => {
    const flow = DEFAULT_FLOW.filter((k) => k !== "delivery-location");
    expect(validateRequiredFieldGroups(flow, { condition: "good", can_ship: null })).toBeNull();
  });

  it("allows both to be null when the flow omits both groups", () => {
    const flow = DEFAULT_FLOW.filter((k) => k !== "condition" && k !== "delivery-location");
    expect(validateRequiredFieldGroups(flow, { condition: null, can_ship: null })).toBeNull();
  });
});
