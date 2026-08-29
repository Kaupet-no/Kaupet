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
  "session_id",
  "user_id",
];

function event(
  session: string,
  eventName: string,
  extra: Partial<ProductEventRow> = {},
): ProductEventRow {
  return {
    session_id: session,
    event_name: eventName,
    platform: "web",
    created_at: CREATED_AT,
    ...FORBIDDEN,
    ...extra,
  };
}

function completeJourney(index: number): ProductEventRow[] {
  const session = `raw-session-${index}`;
  const step = index % 2 === 0 ? "title-photos" : "photos";
  return [
    event(session, "search_opened"),
    event(session, "search_submitted"),
    event(session, "search_zero_results"),
    event(session, "listing_opened"),
    event(session, "contact_started"),
    event(session, "listing_creation_started", { kind: "sell" }),
    event(session, "listing_creation_step_completed", {
      action: "viewed",
      kind: "sell",
      step,
    }),
    event(session, "listing_creation_step_completed", {
      action: "completed",
      kind: "sell",
      step,
    }),
    event(session, "listing_published", { kind: "sell" }),
  ];
}

function completeRows(count = SMALL_CELL_THRESHOLD): ProductEventRow[] {
  return Array.from({ length: count }, (_, index) => completeJourney(index)).flat();
}

function expectedCompleteReport() {
  return {
    schemaVersion: 1,
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
    limitations: ["environment_marker_missing", "journey_id_missing"],
  };
}
it("summerer de nye søkehandlingssignalene per unik sesjon", () => {
  const rows = [
    ...completeRows(),
    ...Array.from({ length: SMALL_CELL_THRESHOLD }, (_, index) => {
      const session = `raw-session-${index}`;
      return [
        event(session, "search_page_viewed"),
        event(session, "search_filter_opened"),
        event(session, "search_filter_applied"),
        event(session, "search_filter_cancelled"),
        event(session, "search_suggestion_selected"),
        event(session, "search_zero_results_recovered"),
        event(session, "search_map_opened"),
        event(session, "search_saved"),
        event(session, "search_result_opened"),
      ];
    }).flat(),
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
      schemaVersion: 1,
      environment: "local",
      window: { from: "2026-08-17", to: "2026-08-24", timezone: "UTC" },
      privacy: {
        smallCellThreshold: 5,
        suppressedGroups: { search: 0, composer: 0, composerSteps: 0 },
      },
      funnels: { search: [], composer: [] },
      limitations: ["environment_marker_missing", "journey_id_missing"],
    });
  });

  it("collapses duplicate fire-and-forget events", () => {
    const rows = completeRows();
    expect(aggregateWeeklyFunnel([...rows, ...rows], OPTIONS)).toEqual(expectedCompleteReport());
  });

  it("does not depend on fire-and-forget receive order", () => {
    expect(aggregateWeeklyFunnel(completeRows().reverse(), OPTIONS)).toEqual(
      expectedCompleteReport(),
    );
  });

  it("does not promote incomplete journeys", () => {
    const incomplete = [
      event("incomplete-search", "search_opened"),
      event("orphan-search", "listing_opened"),
      event("orphan-search", "contact_started"),
      event("orphan-composer", "listing_creation_step_completed", {
        action: "completed",
        kind: "sell",
        step: "photos",
      }),
      event("orphan-composer", "listing_published", { kind: "sell" }),
      event("unknown-step", "listing_creation_started", { kind: "sell" }),
      event("unknown-step", "listing_creation_step_completed", {
        action: "viewed",
        kind: "sell",
        step: "uncontrolled free text",
      }),
    ];

    const report = aggregateWeeklyFunnel([...completeRows(), ...incomplete], OPTIONS);
    expect(report.funnels.search[0]).toEqual({
      ...expectedCompleteReport().funnels.search[0],
      opened: 6,
      submissionRate: 0.8333,
    });
    expect(report.funnels.composer[0]).toEqual({
      ...expectedCompleteReport().funnels.composer[0],
      started: 6,
      publishRate: 0.8333,
      steps: [
        {
          ...expectedCompleteReport().funnels.composer[0].steps[0],
          viewRate: 0.8333,
        },
      ],
    });
  });

  it("suppresses groups containing positive cells below the threshold", () => {
    expect(aggregateWeeklyFunnel(completeRows(SMALL_CELL_THRESHOLD - 1), OPTIONS)).toEqual({
      schemaVersion: 1,
      environment: "local",
      window: { from: "2026-08-17", to: "2026-08-24", timezone: "UTC" },
      privacy: {
        smallCellThreshold: 5,
        suppressedGroups: { search: 1, composer: 1, composerSteps: 0 },
      },
      funnels: { search: [], composer: [] },
      limitations: ["environment_marker_missing", "journey_id_missing"],
    });

    const stepSmall = completeRows().filter(
      (row) =>
        !(
          row.session_id === "raw-session-4" && row.event_name === "listing_creation_step_completed"
        ),
    );
    const report = aggregateWeeklyFunnel(stepSmall, OPTIONS);
    expect(report.privacy.suppressedGroups).toEqual({
      search: 0,
      composer: 0,
      composerSteps: 1,
    });
    expect(report.funnels.search).toEqual(expectedCompleteReport().funnels.search);
    expect(report.funnels.composer).toEqual([
      { ...expectedCompleteReport().funnels.composer[0], steps: [] },
    ]);
  });

  it("never includes forbidden properties, raw sessions, or event timestamps in output", () => {
    const output = JSON.stringify(aggregateWeeklyFunnel(completeRows(), OPTIONS));
    for (const forbidden of [...FORBIDDEN_FIELDS, ...Object.values(FORBIDDEN), CREATED_AT]) {
      expect(output).not.toContain(forbidden);
    }
    for (let index = 0; index < SMALL_CELL_THRESHOLD; index += 1) {
      expect(output).not.toContain(`raw-session-${index}`);
    }
  });
});
