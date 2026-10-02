import { describe, expect, it } from "vitest";
import { buildPreviewDraft, type PreviewDraftInput } from "./preview-draft-store";

const base: PreviewDraftInput = {
  title: "T",
  subtitle: "",
  description: "D",
  isFree: false,
  validPriceNok: 500,
  fieldGroupKeys: [],
  condition: "ny",
  requiresDeliveryMethod: true,
  canShip: null,
  city: "",
  postalCode: "",
  coords: null,
  isVehicle: false,
  knownIssues: "feil",
  noKnownIssues: true,
  maintenanceHistory: "service",
  categoryId: null,
  categoryNode: undefined,
  images: [],
  attributes: { a: 1 },
};
const build = (o: Partial<PreviewDraftInput> = {}) => buildPreviewDraft({ ...base, ...o });

describe("buildPreviewDraft", () => {
  it("pris vs gratis", () => {
    expect(build().priceNok).toBe(500);
    expect(build({ isFree: true })).toMatchObject({ priceNok: null, isFree: true });
  });

  it("condition bare når gruppen er med", () => {
    expect(build().condition).toBeNull();
    expect(build({ fieldGroupKeys: ["condition"] }).condition).toBe("ny");
    expect(build({ fieldGroupKeys: ["condition"], condition: undefined }).condition).toBeNull();
  });

  it("canShip", () => {
    expect(build({ requiresDeliveryMethod: false, canShip: "ship" }).canShip).toBeNull();
    expect(build({ canShip: "pickup" }).canShip).toBe(false);
    expect(build({ canShip: "ship" }).canShip).toBe(true);
    expect(build({ canShip: null }).canShip).toBeNull();
  });

  it("kjøretøyfelt bare når isVehicle", () => {
    expect(build()).toMatchObject({
      knownIssues: null,
      noKnownIssues: null,
      maintenanceHistory: null,
    });
    expect(build({ isVehicle: true })).toMatchObject({
      knownIssues: "feil",
      noKnownIssues: true,
      maintenanceHistory: "service",
    });
    expect(
      build({ isVehicle: true, knownIssues: "", noKnownIssues: undefined, maintenanceHistory: "" }),
    ).toMatchObject({ knownIssues: null, noKnownIssues: false, maintenanceHistory: null });
  });

  it("tomme strenger og koordinater", () => {
    expect(build()).toMatchObject({
      subtitle: null,
      city: null,
      postalCode: null,
      displayLat: null,
      displayLng: null,
    });
    expect(
      build({ subtitle: "s", city: "Oslo", postalCode: "0150", coords: { lat: 1, lng: 2 } }),
    ).toMatchObject({
      subtitle: "s",
      city: "Oslo",
      postalCode: "0150",
      displayLat: 1,
      displayLng: 2,
    });
  });

  it("bilder: caption trimmes, imgUrls nøklet på indeks", () => {
    const d = build({
      images: [
        { caption: "  hei  ", previewUrl: "blob:a" },
        { caption: "   ", previewUrl: "blob:b" },
        { previewUrl: "blob:c" },
      ],
    });
    expect(d.images).toEqual([
      { storage_path: "0", sort_order: 0, caption: "hei" },
      { storage_path: "1", sort_order: 1, caption: null },
      { storage_path: "2", sort_order: 2, caption: null },
    ]);
    expect(d.imgUrls).toEqual({ "0": "blob:a", "1": "blob:b", "2": "blob:c" });
  });

  it("kategori", () => {
    expect(build()).toMatchObject({ category: null, categoryId: null });
    expect(
      build({ categoryId: "c1", categoryNode: { name_nb: "Bil", slug: "bil" } }),
    ).toMatchObject({
      category: { name_nb: "Bil", slug: "bil" },
      categoryId: "c1",
    });
    expect(build({ categoryNode: { name_nb: "X" } }).category).toEqual({
      name_nb: "X",
      slug: null,
    });
  });
});
