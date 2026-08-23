import { describe, expect, it } from "vitest";

import {
  canPreviewDraft,
  composerForwardStep,
  composerSwipeDirection,
  reviewSectionSteps,
} from "./composer-navigation";

describe("composerForwardStep", () => {
  it("returns to review after editing a review section", () => {
    expect(composerForwardStep(2, 5, true)).toBe(5);
    expect(composerForwardStep(2, 5, false)).toBe(2);
  });
});

describe("composerflyt fra preview og review", () => {
  const nativePages = [
    { groups: [{ key: "category-select" }] },
    { groups: [{ key: "photos" }, { key: "title" }] },
    { groups: [{ key: "category-attributes" }, { key: "description-keywords" }] },
    {
      groups: [{ key: "condition" }, { key: "price" }, { key: "delivery" }, { key: "location" }],
    },
    { groups: [{ key: "review-publish" }] },
  ];

  it("tilbyr levende preview på første side etter innholdssiden", () => {
    expect(canPreviewDraft(nativePages, 2, true)).toBe(false);
    expect(canPreviewDraft(nativePages, 3, true)).toBe(true);
    expect(canPreviewDraft(nativePages, 3, false)).toBe(false);
  });

  it("åpner siden som eier reviewgruppen og returnerer etter siste grupperte side", () => {
    expect(reviewSectionSteps(nativePages, ["photos", "title"])).toEqual({ first: 2, last: 2 });
    expect(
      reviewSectionSteps(nativePages, ["category-attributes", "description-keywords", "price"]),
    ).toEqual({ first: 3, last: 4 });
    expect(reviewSectionSteps(nativePages, ["delivery", "location"])).toEqual({
      first: 4,
      last: 4,
    });
    expect(composerForwardStep(5, nativePages.length, true)).toBe(5);
  });

  it("finner båtens detaljside når flere feltgrupper deler samme native side", () => {
    const boatPages = [
      { groups: [{ key: "photos" }] },
      {
        groups: [
          { key: "boat-facts" },
          { key: "category-attributes" },
          { key: "description-keywords" },
        ],
      },
      { groups: [{ key: "delivery" }, { key: "location" }] },
      { groups: [{ key: "review-publish" }] },
    ];

    expect(reviewSectionSteps(boatPages, ["boat-facts", "category-attributes"])).toEqual({
      first: 2,
      last: 2,
    });
  });
});

describe("composerSwipeDirection", () => {
  it("godtar tydelige horisontale swipe i begge retninger", () => {
    expect(composerSwipeDirection(-80, 12)).toBe("forward");
    expect(composerSwipeDirection(80, -12)).toBe("back");
  });

  it("avviser korte og hovedsakelig vertikale bevegelser", () => {
    expect(composerSwipeDirection(-40, 0)).toBeNull();
    expect(composerSwipeDirection(-80, 70)).toBeNull();
  });

  it("godtar en kort, tydelig flick basert på hastighet", () => {
    expect(composerSwipeDirection(-40, 4, 64, 60)).toBe("forward");
    expect(composerSwipeDirection(-40, 4, 64, 200)).toBeNull();
  });
});
