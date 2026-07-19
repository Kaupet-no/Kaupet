import { describe, expect, it } from "vitest";

import { classifyVehicleCategory } from "./vehicle-classification";

describe("classifyVehicleCategory", () => {
  describe("avgiftsklasse (primary signal)", () => {
    it("maps 101 to personbil", () => {
      expect(classifyVehicleCategory(null, "101", null, null)).toEqual({
        slug: "personbil",
        confidence: "high",
      });
    });

    it("maps 313/316 to bobil-og-campingvogn", () => {
      expect(classifyVehicleCategory(null, "313", null, null)).toEqual({
        slug: "bobil-og-campingvogn",
        confidence: "high",
      });
      expect(classifyVehicleCategory(null, "316", null, null)).toEqual({
        slug: "bobil-og-campingvogn",
        confidence: "high",
      });
    });

    it("upgrades a personbil-taxed vehicle to bobil-og-campingvogn on a camper body-type hint", () => {
      expect(classifyVehicleCategory(null, "101", "Bobil", null)).toEqual({
        slug: "bobil-og-campingvogn",
        confidence: "high",
      });
    });

    it("upgrades a personbil-taxed vehicle to bobil-og-campingvogn on sleeping places", () => {
      expect(classifyVehicleCategory(null, "101", null, 4)).toEqual({
        slug: "bobil-og-campingvogn",
        confidence: "high",
      });
    });

    it.each(["301", "310", "311", "314", "315"])("maps %s to varebil", (code) => {
      expect(classifyVehicleCategory(null, code, null, null)).toEqual({
        slug: "varebil",
        confidence: "high",
      });
    });

    it("maps 601 to moped-og-scooter", () => {
      expect(classifyVehicleCategory(null, "601", null, null)).toEqual({
        slug: "moped-og-scooter",
        confidence: "high",
      });
    });

    it.each(["610", "620", "621"])("maps %s to motorsykkel", (code) => {
      expect(classifyVehicleCategory(null, code, null, null)).toEqual({
        slug: "motorsykkel",
        confidence: "high",
      });
    });

    it("maps 630 (beltemotorsykkel) to atv-og-snoscooter", () => {
      expect(classifyVehicleCategory(null, "630", null, null)).toEqual({
        slug: "atv-og-snoscooter",
        confidence: "high",
      });
    });

    it.each(["701", "711", "721", "729"])("maps %s to tilhenger-leaf", (code) => {
      expect(classifyVehicleCategory(null, code, null, null)).toEqual({
        slug: "tilhenger-leaf",
        confidence: "high",
      });
    });

    it("falls through to the EU-code fallback for unmapped avgiftsklasse groups (buss/lastebil/traktor/motorredskap)", () => {
      expect(classifyVehicleCategory("M1", "201", null, null)).toEqual({
        slug: "personbil",
        confidence: "high",
      });
      expect(classifyVehicleCategory(null, "401", null, null)).toEqual({
        slug: null,
        confidence: "low",
      });
    });
  });

  describe("EU technical class (fallback when avgiftsklasse is missing)", () => {
    it("maps M1 to personbil by default", () => {
      expect(classifyVehicleCategory("M1", null, null, null)).toEqual({
        slug: "personbil",
        confidence: "high",
      });
    });

    it("maps M1 with a bobil body-type hint to bobil-og-campingvogn", () => {
      expect(classifyVehicleCategory("M1", null, "Bobil", null)).toEqual({
        slug: "bobil-og-campingvogn",
        confidence: "high",
      });
    });

    it("maps M1 with sleeping places to bobil-og-campingvogn", () => {
      expect(classifyVehicleCategory("M1", null, null, 4)).toEqual({
        slug: "bobil-og-campingvogn",
        confidence: "high",
      });
    });

    it("maps N1 to varebil", () => {
      expect(classifyVehicleCategory("N1", null, null, null)).toEqual({
        slug: "varebil",
        confidence: "high",
      });
    });

    it.each(["L3e", "L4e"])("maps %s to motorsykkel", (code) => {
      expect(classifyVehicleCategory(code, null, null, null)).toEqual({
        slug: "motorsykkel",
        confidence: "high",
      });
    });

    it.each(["L1e", "L2e"])("maps %s to moped-og-scooter", (code) => {
      expect(classifyVehicleCategory(code, null, null, null)).toEqual({
        slug: "moped-og-scooter",
        confidence: "high",
      });
    });

    it.each(["L5e", "L6e", "L7e"])("maps %s to atv-og-snoscooter with low confidence", (code) => {
      expect(classifyVehicleCategory(code, null, null, null)).toEqual({
        slug: "atv-og-snoscooter",
        confidence: "low",
      });
    });

    it.each(["O1", "O2", "O3", "O4"])("maps %s to tilhenger-leaf", (code) => {
      expect(classifyVehicleCategory(code, null, null, null)).toEqual({
        slug: "tilhenger-leaf",
        confidence: "high",
      });
    });

    it("returns null for unknown codes", () => {
      expect(classifyVehicleCategory("N2", null, null, null)).toEqual({
        slug: null,
        confidence: "low",
      });
    });

    it("returns null when no code is present", () => {
      expect(classifyVehicleCategory(null, null, null, null)).toEqual({
        slug: null,
        confidence: "low",
      });
    });
  });
});
