import { describe, expect, it } from "vitest";

import { classifyVehicleCategory } from "./vehicle-classification";

describe("classifyVehicleCategory", () => {
  it("maps M1 to personbil by default", () => {
    expect(classifyVehicleCategory("M1", null, null)).toEqual({
      slug: "personbil",
      confidence: "high",
    });
  });

  it("maps M1 with a bobil body-type hint to bobil-og-campingvogn", () => {
    expect(classifyVehicleCategory("M1", "Bobil", null)).toEqual({
      slug: "bobil-og-campingvogn",
      confidence: "high",
    });
  });

  it("maps M1 with sleeping places to bobil-og-campingvogn", () => {
    expect(classifyVehicleCategory("M1", null, 4)).toEqual({
      slug: "bobil-og-campingvogn",
      confidence: "high",
    });
  });

  it("maps N1 to varebil", () => {
    expect(classifyVehicleCategory("N1", null, null)).toEqual({
      slug: "varebil",
      confidence: "high",
    });
  });

  it.each(["L3e", "L4e"])("maps %s to motorsykkel", (code) => {
    expect(classifyVehicleCategory(code, null, null)).toEqual({
      slug: "motorsykkel",
      confidence: "high",
    });
  });

  it.each(["L1e", "L2e"])("maps %s to moped-og-scooter", (code) => {
    expect(classifyVehicleCategory(code, null, null)).toEqual({
      slug: "moped-og-scooter",
      confidence: "high",
    });
  });

  it.each(["L5e", "L6e", "L7e"])("maps %s to atv-og-snoscooter with low confidence", (code) => {
    expect(classifyVehicleCategory(code, null, null)).toEqual({
      slug: "atv-og-snoscooter",
      confidence: "low",
    });
  });

  it.each(["O1", "O2", "O3", "O4"])("maps %s to tilhenger-leaf", (code) => {
    expect(classifyVehicleCategory(code, null, null)).toEqual({
      slug: "tilhenger-leaf",
      confidence: "high",
    });
  });

  it("returns null for unknown codes", () => {
    expect(classifyVehicleCategory("N2", null, null)).toEqual({ slug: null, confidence: "low" });
  });

  it("returns null when no code is present", () => {
    expect(classifyVehicleCategory(null, null, null)).toEqual({ slug: null, confidence: "low" });
  });
});
