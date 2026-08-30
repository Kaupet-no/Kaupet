import { describe, expect, it } from "vitest";

import {
  aggregateWeeklyFunnel,
  SMALL_CELL_THRESHOLD,
  type ProductEventRow,
} from "../../scripts/weekly-funnel";

const OPTIONS = { environment: "local" as const, from: "2026-08-17", to: "2026-08-24" };
const CREATED_AT = "2026-08-19T12:34:56.000Z";
const FORBIDDEN = {
  address: "Storgata 1",
  query: "secret search text",
  registration_number: "EK12345",
  user_id: "forbidden-user-id",
};
const FORBIDDEN_FIELDS = [
  "address",
  "created_at",
  "event_name",
  "path",
  "properties",
  "query",
  "registration_number",
  "user_id",
];

function event(eventName: string, extra: Partial<ProductEventRow> = {}): ProductEventRow {
  return {
    event_name: eventName,
    platform: "web",
    created_at: CREATED_AT,
    ...FORBIDDEN,
    ...extra,
  };
}

/** One full sell journey, from search through publish. `stepAlias` lets a
 * test drive both the legacy and current step key through the same shape,
 * since both must normalize to "photos" (see LEGACY_STEP_ALIASES). */
function completeJourney(stepAlias: "title-photos" | "photos" = "photos"): ProductEventRow[] {
  return [
    event("search_opened"),
    event("search_submitted"),
    event("search_zero_results"),
    event("listing_opened"),
    event("contact_started"),
    event("listing_creation_started", { kind: "sell" }),
    event("listing_creation_step_completed", { action: "viewed", kind: "sell", step: stepAlias }),
    event("listing_creation_step_completed", {
      action: "completed",
      kind: "sell",
      step: stepAlias,
    }),
    event("listing_published", { kind: "sell" }),
  ];
}

function completeRows(count = SMALL_CELL_THRESHOLD): ProductEventRow[] {
  return Array.from({ length: count }, (_, index) =>
    completeJourney(index % 2 === 0 ? "title-photos" : "photos"),
  ).flat();
}

function expectedCompleteReport() {
  return {
    schemaVersion: 2,
    environment: "local",
    window: { from: "2026-08-17", to: "2026-08-24", timezone: "UTC" },
    privacy: {
      smallCellThreshold: 5,
      suppressedGroups: { search: 0, composer: 0, composerSteps: 0 },
    },
    funnels: {
      search: [
        {
          platform: "web",
          pageViewed: 0,
          opened: 5,
          submitted: 5,
          submissionRate: 1,
          filterOpened: 0,
          filterApplied: 0,
          filterCancelled: 0,
          suggestions: 0,
          zeroResults: 5,
          zeroResultRate: 1,
          zeroResultRecovery: 0,
          mapOpened: 0,
          saved: 0,
          resultOpened: 0,
          listingOpened: 5,
          listingOpenRate: 1,
          contactStarted: 5,
          contactStartRate: 1,
        },
      ],
      composer: [
        {
          platform: "web",
          kind: "sell",
          started: 5,
          published: 5,
          publishRate: 1,
          steps: [
            {
              step: "photos",
              viewed: 5,
              viewRate: 1,
              completed: 5,
              completionRate: 1,
            },
          ],
        },
      ],
    },
    limitations: [
      "environment_marker_missing",
      "journey_id_missing",
      "session_correlation_removed",
    ],
  };
}

it("summerer nye søkehandlingssignaler som uavhengige hendelser", () => {
  const rows = [
    ...completeRows(),
    ...Array.from({ length: SMALL_CELL_THRESHOLD }, () => [
      event("search_page_viewed"),
      event("search_filter_opened"),
      event("search_filter_applied"),
      event("search_filter_cancelled"),
      event("search_suggestion_selected"),
      event("search_zero_results_recovered"),
      event("search_map_opened"),
      event("search_saved"),
      event("search_result_opened"),
    ]).flat(),
  ];

  expect(aggregateWeeklyFunnel(rows, OPTIONS).funnels.search[0]).toMatchObject({
    pageViewed: 5,
    filterOpened: 5,
    filterApplied: 5,
    filterCancelled: 5,
    suggestions: 5,
    zeroResultRecovery: 5,
    mapOpened: 5,
    saved: 5,
    resultOpened: 5,
  });
});

describe("weekly funnel aggregation", () => {
  it("aggregates a normal journey and merges controlled old/new step keys", () => {
    expect(aggregateWeeklyFunnel(completeRows(), OPTIONS)).toEqual(expectedCompleteReport());
  });

  it("returns a deterministic empty report for an empty window", () => {
    expect(aggregateWeeklyFunnel([], OPTIONS)).toEqual({
      schemaVersion: 2,
      environment: "local",
      window: { from: "2026-08-17", to: "2026-08-24", timezone: "UTC" },
      privacy: {
        smallCellThreshold: 5,
        suppressedGroups: { search: 0, composer: 0, composerSteps: 0 },
      },
      funnels: { search: [], composer: [] },
      limitations: [
        "environment_marker_missing",
        "journey_id_missing",
        "session_correlation_removed",
      ],
    });
  });

  it("counts duplicate fire-and-forget rows independently (no session to dedupe against)", () => {
    const rows = completeRows();
    const doubled = aggregateWeeklyFunnel([...rows, ...rows], OPTIONS);
    expect(doubled.funnels.search[0]).toMatchObject({ opened: 10, submitted: 10, zeroResults: 10 });
    expect(doubled.funnels.composer[0]).toMatchObject({ started: 10, published: 10 });
  });

  it("does not depend on fire-and-forget receive order", () => {
    expect(aggregateWeeklyFunnel(completeRows().reverse(), OPTIONS)).toEqual(
      expectedCompleteReport(),
    );
  });

  it("counts every event on its own, without gating on an in-progress journey", () => {
    const extra = [
      event("search_opened"),
      event("listing_opened"),
      event("contact_started"),
      event("listing_creation_step_completed", {
        action: "completed",
        kind: "sell",
        step: "photos",
      }),
      event("listing_published", { kind: "sell" }),
      event("listing_creation_started", { kind: "sell" }),
      event("listing_creation_step_completed", {
        action: "viewed",
        kind: "sell",
        step: "uncontrolled free text",
      }),
    ];

    const report = aggregateWeeklyFunnel([...completeRows(), ...extra], OPTIONS);
    expect(report.funnels.search[0]).toMatchObject({
      opened: 6,
      submitted: 5,
      listingOpened: 6,
      contactStarted: 6,
    });
    expect(report.funnels.composer[0]).toMatchObject({ started: 6, published: 6 });
    // The unlisted "uncontrolled free text" step never surfaces as its own row.
    expect(report.funnels.composer[0].steps).toEqual([
      { step: "photos", viewed: 5, viewRate: 0.8333, completed: 6, completionRate: 1.2 },
    ]);
  });

  it("suppresses groups containing positive cells below the threshold", () => {
    expect(aggregateWeeklyFunnel(completeRows(SMALL_CELL_THRESHOLD - 1), OPTIONS)).toEqual({
      schemaVersion: 2,
      environment: "local",
      window: { from: "2026-08-17", to: "2026-08-24", timezone: "UTC" },
      privacy: {
        smallCellThreshold: 5,
        suppressedGroups: { search: 1, composer: 1, composerSteps: 0 },
      },
      funnels: { search: [], composer: [] },
      limitations: [
        "environment_marker_missing",
        "journey_id_missing",
        "session_correlation_removed",
      ],
    });

    // Composer started/published stay at the full threshold; only the step
    // pair for one journey is missing, so just that step group is suppressed.
    const stepSmall = [
      ...completeRows(SMALL_CELL_THRESHOLD - 1),
      ...completeJourney().filter((row) => row.event_name !== "listing_creation_step_completed"),
    ];
    const report = aggregateWeeklyFunnel(stepSmall, OPTIONS);
    expect(report.privacy.suppressedGroups).toEqual({ search: 0, composer: 0, composerSteps: 1 });
    expect(report.funnels.search).toEqual(expectedCompleteReport().funnels.search);
    expect(report.funnels.composer).toEqual([
      { ...expectedCompleteReport().funnels.composer[0], steps: [] },
    ]);
  });

  it("never includes forbidden properties or raw event timestamps in output", () => {
    const output = JSON.stringify(aggregateWeeklyFunnel(completeRows(), OPTIONS));
    for (const forbidden of [...FORBIDDEN_FIELDS, ...Object.values(FORBIDDEN), CREATED_AT]) {
      expect(output).not.toContain(forbidden);
    }
  });
});
