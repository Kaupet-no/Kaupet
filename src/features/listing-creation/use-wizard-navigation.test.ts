import { describe, expect, it } from "vitest";

import type { FieldGroup } from "./field-groups/registry";
import { isReviewEditFinished, reviewEditTarget } from "./use-wizard-navigation";
import type { WizardPage } from "./use-listing-steps";

function pages(...pageKeys: string[][]): WizardPage[] {
  return pageKeys.map((keys) => ({
    groups: keys.map((key) => ({ key }) as unknown as FieldGroup),
  }));
}

describe("reviewEditTarget", () => {
  const flow = pages(
    ["photos"],
    ["category-attributes"],
    ["price", "location"],
    ["review-publish"],
  );

  it("hopper til første og siste side for seksjonens feltgrupper", () => {
    expect(reviewEditTarget(flow, "details")).toEqual({ first: 2, last: 3 });
    expect(reviewEditTarget(flow, "content")).toEqual({ first: 1, last: 1 });
  });

  it("lar eksplisitt groupKey gå foran seksjonen", () => {
    expect(reviewEditTarget(flow, "details", { groupKey: "photos" })).toEqual({
      first: 1,
      last: 1,
    });
  });

  it("faller tilbake til seksjonen når groupKey ikke finnes på noen side", () => {
    expect(reviewEditTarget(flow, "location", { groupKey: "ukjent" })).toEqual({
      first: 3,
      last: 3,
    });
  });

  it("gir null når ingen side har seksjonens grupper (landing-flyten uten category-select)", () => {
    expect(reviewEditTarget(flow, "category")).toBeNull();
  });
});

describe("isReviewEditFinished", () => {
  it("er sann bare på siste steg i en pågående review-redigering", () => {
    expect(isReviewEditFinished(true, 3, 3)).toBe(true);
    expect(isReviewEditFinished(true, 2, 3)).toBe(false);
    expect(isReviewEditFinished(false, 3, 3)).toBe(false);
    expect(isReviewEditFinished(true, 3, null)).toBe(false);
  });
});
