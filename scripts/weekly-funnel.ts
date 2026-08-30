#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const RELEVANT_EVENT_NAMES = [
  "search_opened",
  "search_submitted",
  "search_zero_results",
  "search_page_viewed",
  "search_filter_opened",
  "search_filter_applied",
  "search_filter_cancelled",
  "search_suggestion_selected",
  "search_zero_results_recovered",
  "search_map_opened",
  "search_saved",
  "search_result_opened",
  "listing_opened",
  "contact_started",
  "listing_creation_started",
  "listing_creation_step_completed",
  "listing_published",
] as const;
const PLATFORMS = ["android", "ios", "web"] as const;
const KINDS = ["sell", "want"] as const;
const ALLOWED_STEPS = new Set([
  "attributes",
  "boat-facts",
  "category",
  "category-attributes",
  "category-confirm",
  "category-select",
  "condition",
  "delivery",
  "description-keywords",
  "details",
  "location",
  "photos",
  "price",
  "review",
  "review-publish",
  "title",
  "vehicle-360",
  "vehicle-condition",
  "vehicle-equipment",
  "vehicle-facts",
  "vehicle-price",
  "vehicle-registration",
]);
const LEGACY_STEP_ALIASES: Readonly<Record<string, string>> = {
  "delivery-location": "delivery",
  "title-photos": "photos",
  "vehicle-confirm": "vehicle-registration",
};

/** A group is emitted only when its raw event count reaches this many. */
export const SMALL_CELL_THRESHOLD = 5;

export type ProductEventRow = {
  event_name: unknown;
  platform: unknown;
  created_at: unknown;
  kind?: unknown;
  action?: unknown;
  step?: unknown;
  [key: string]: unknown;
};

type Platform = (typeof PLATFORMS)[number];
type Kind = (typeof KINDS)[number];
type Environment = "local" | "production" | "staging";
type Window = { from: string; to: string; fromMs: number; toMs: number };
type SearchCounts = {
  opened: number;
  pageViewed: number;
  submitted: number;
  zeroResults: number;
  zeroResultRecovery: number;
  filterOpened: number;
  filterApplied: number;
  filterCancelled: number;
  suggestions: number;
  mapOpened: number;
  saved: number;
  resultOpened: number;
  listingOpened: number;
  contactStarted: number;
};
type ComposerStepCounts = { viewed: number; completed: number };
type ComposerCounts = {
  started: number;
  published: number;
  steps: Map<string, ComposerStepCounts>;
};

function parseWindow(from: string, to: string): Window {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!datePattern.test(from) || !datePattern.test(to)) {
    throw new Error("--from and --to must use YYYY-MM-DD UTC dates");
  }
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    new Date(fromMs).toISOString().slice(0, 10) !== from ||
    new Date(toMs).toISOString().slice(0, 10) !== to ||
    toMs - fromMs !== 7 * 86_400_000
  ) {
    throw new Error("--from (inclusive) and --to (exclusive) must define exactly seven UTC days");
  }
  return { from, to, fromMs, toMs };
}

function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

function normalizeStep(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = LEGACY_STEP_ALIASES[value] ?? value;
  return ALLOWED_STEPS.has(normalized) ? normalized : null;
}

function searchCounts(): SearchCounts {
  return {
    opened: 0,
    pageViewed: 0,
    submitted: 0,
    zeroResults: 0,
    zeroResultRecovery: 0,
    filterOpened: 0,
    filterApplied: 0,
    filterCancelled: 0,
    suggestions: 0,
    mapOpened: 0,
    saved: 0,
    resultOpened: 0,
    listingOpened: 0,
    contactStarted: 0,
  };
}

function composerCounts(): ComposerCounts {
  return { started: 0, published: 0, steps: new Map() };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function isSmallCell(counts: readonly number[]): boolean {
  return counts.some((count) => count > 0 && count < SMALL_CELL_THRESHOLD);
}

function inWindow(createdAt: unknown, window: Window): boolean {
  if (typeof createdAt !== "string") return false;
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp >= window.fromMs && timestamp < window.toMs;
}

/**
 * Counts raw, anonymous events by safe dimensions. Events carry no session or
 * user identifier (removed so client-side telemetry storage needs no cookie
 * consent under ekomloven § 3-15), so this reports event-volume ratios
 * ("of N search submissions, M opened a listing") rather than distinct-
 * session conversion rates. A user who repeats an action within the window
 * is counted once per event, not once per session.
 */
export function aggregateWeeklyFunnel(
  rows: readonly ProductEventRow[],
  options: { environment: Environment; from: string; to: string },
) {
  const window = parseWindow(options.from, options.to);
  const search = new Map<Platform, SearchCounts>();
  const composer = new Map<string, { platform: Platform; kind: Kind; state: ComposerCounts }>();

  for (const row of rows) {
    if (!isPlatform(row.platform) || !inWindow(row.created_at, window)) continue;

    if (
      row.event_name === "search_opened" ||
      row.event_name === "search_page_viewed" ||
      row.event_name === "search_submitted" ||
      row.event_name === "search_zero_results" ||
      row.event_name === "search_filter_opened" ||
      row.event_name === "search_filter_applied" ||
      row.event_name === "search_filter_cancelled" ||
      row.event_name === "search_suggestion_selected" ||
      row.event_name === "search_zero_results_recovered" ||
      row.event_name === "search_map_opened" ||
      row.event_name === "search_saved" ||
      row.event_name === "search_result_opened" ||
      row.event_name === "listing_opened" ||
      row.event_name === "contact_started"
    ) {
      const state = search.get(row.platform) ?? searchCounts();
      search.set(row.platform, state);
      if (row.event_name === "search_opened") state.opened += 1;
      if (row.event_name === "search_page_viewed") state.pageViewed += 1;
      if (row.event_name === "search_submitted") state.submitted += 1;
      if (row.event_name === "search_zero_results") state.zeroResults += 1;
      if (row.event_name === "search_zero_results_recovered") state.zeroResultRecovery += 1;
      if (row.event_name === "search_filter_opened") state.filterOpened += 1;
      if (row.event_name === "search_filter_applied") state.filterApplied += 1;
      if (row.event_name === "search_filter_cancelled") state.filterCancelled += 1;
      if (row.event_name === "search_suggestion_selected") state.suggestions += 1;
      if (row.event_name === "search_map_opened") state.mapOpened += 1;
      if (row.event_name === "search_saved") state.saved += 1;
      if (row.event_name === "search_result_opened") state.resultOpened += 1;
      if (row.event_name === "listing_opened") state.listingOpened += 1;
      if (row.event_name === "contact_started") state.contactStarted += 1;
      continue;
    }

    if (
      !isKind(row.kind) ||
      (row.event_name !== "listing_creation_started" &&
        row.event_name !== "listing_creation_step_completed" &&
        row.event_name !== "listing_published")
    ) {
      continue;
    }

    const key = `${row.platform}:${row.kind}`;
    const group = composer.get(key) ?? {
      platform: row.platform,
      kind: row.kind,
      state: composerCounts(),
    };
    composer.set(key, group);
    if (row.event_name === "listing_creation_started") group.state.started += 1;
    if (row.event_name === "listing_published") group.state.published += 1;
    if (row.event_name !== "listing_creation_step_completed") continue;

    const step = normalizeStep(row.step);
    if (!step || (row.action !== "viewed" && row.action !== "completed")) continue;
    const stepState = group.state.steps.get(step) ?? { viewed: 0, completed: 0 };
    group.state.steps.set(step, stepState);
    stepState[row.action] += 1;
  }

  let suppressedSearchGroups = 0;
  const searchReport = PLATFORMS.flatMap((platform) => {
    const state = search.get(platform);
    if (!state) return [];
    const opened = state.opened + state.pageViewed;
    const counts = [
      opened,
      state.submitted,
      state.zeroResults,
      state.listingOpened,
      state.contactStarted,
    ];
    if (opened === 0) return [];
    if (isSmallCell(counts)) {
      suppressedSearchGroups += 1;
      return [];
    }
    return [
      {
        platform,
        pageViewed: state.pageViewed,
        opened,
        submitted: state.submitted,
        submissionRate: rate(state.submitted, opened),
        filterOpened: state.filterOpened,
        filterApplied: state.filterApplied,
        filterCancelled: state.filterCancelled,
        suggestions: state.suggestions,
        zeroResults: state.zeroResults,
        zeroResultRate: rate(state.zeroResults, state.submitted),
        zeroResultRecovery: state.zeroResultRecovery,
        mapOpened: state.mapOpened,
        saved: state.saved,
        resultOpened: state.resultOpened,
        listingOpened: state.listingOpened,
        listingOpenRate: rate(state.listingOpened, state.submitted),
        contactStarted: state.contactStarted,
        contactStartRate: rate(state.contactStarted, state.listingOpened),
      },
    ];
  });

  let suppressedComposerGroups = 0;
  let suppressedComposerStepGroups = 0;
  const composerReport = [...composer.values()]
    .sort((left, right) =>
      `${left.platform}:${left.kind}`.localeCompare(`${right.platform}:${right.kind}`),
    )
    .flatMap(({ platform, kind, state }) => {
      const started = state.started;
      const published = state.published;
      if (started === 0) return [];
      if (isSmallCell([started, published])) {
        suppressedComposerGroups += 1;
        return [];
      }

      const steps = [...state.steps.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([step, stepState]) => {
          const { viewed, completed } = stepState;
          if (viewed === 0) return [];
          if (isSmallCell([viewed, completed])) {
            suppressedComposerStepGroups += 1;
            return [];
          }
          return [
            {
              step,
              viewed,
              viewRate: rate(viewed, started),
              completed,
              completionRate: rate(completed, viewed),
            },
          ];
        });

      return [
        {
          platform,
          kind,
          started,
          published,
          publishRate: rate(published, started),
          steps,
        },
      ];
    });

  return {
    schemaVersion: 2,
    environment: options.environment,
    window: { from: window.from, to: window.to, timezone: "UTC" as const },
    privacy: {
      smallCellThreshold: SMALL_CELL_THRESHOLD,
      suppressedGroups: {
        search: suppressedSearchGroups,
        composer: suppressedComposerGroups,
        composerSteps: suppressedComposerStepGroups,
      },
    },
    funnels: { search: searchReport, composer: composerReport },
    limitations: [
      "environment_marker_missing",
      "journey_id_missing",
      "session_correlation_removed",
    ] as const,
  };
}

const CREDENTIALS: Record<Environment, readonly [string, string]> = {
  local: ["LOCAL_SUPABASE_URL", "LOCAL_SUPABASE_SERVICE_ROLE_KEY"],
  staging: ["STAGING_SUPABASE_URL", "STAGING_SUPABASE_SERVICE_ROLE_KEY"],
  production: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
};

async function fetchProductEvents(environment: Environment, window: Window) {
  const [urlName, keyName] = CREDENTIALS[environment];
  const url = process.env[urlName];
  const key = process.env[keyName];
  if (!url || !key) throw new Error(`Missing server-side credentials: ${urlName}, ${keyName}`);

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const rows: ProductEventRow[] = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("product_events")
      .select(
        "event_name,platform,created_at,kind:properties->>kind,action:properties->>action,step:properties->>step",
      )
      .in("event_name", [...RELEVANT_EVENT_NAMES])
      .gte("created_at", `${window.from}T00:00:00.000Z`)
      .lt("created_at", `${window.to}T00:00:00.000Z`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not fetch product events: ${error.message}`);
    rows.push(...((data ?? []) as ProductEventRow[]));
    if (!data || data.length < pageSize) return rows;
  }
}

type CliOptions = {
  environment: Environment;
  fixture?: string;
  from: string;
  to: string;
};

function parseArgs(args: readonly string[]): CliOptions {
  if (args.includes("--help")) {
    console.log(
      "Usage: bun scripts/weekly-funnel.ts --env <local|staging|production> --from YYYY-MM-DD --to YYYY-MM-DD [--fixture file.json]",
    );
    process.exitCode = 0;
    throw new Error("help");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Arguments must be explicit --name value pairs");
    }
    if (!["--env", "--fixture", "--from", "--to"].includes(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
    values.set(name, value);
  }

  const environment = values.get("--env");
  const from = values.get("--from");
  const to = values.get("--to");
  if (environment !== "local" && environment !== "staging" && environment !== "production") {
    throw new Error("--env must be local, staging, or production");
  }
  if (!from || !to) throw new Error("--from and --to are required");
  parseWindow(from, to);
  const fixture = values.get("--fixture");
  if (fixture && environment !== "local") {
    throw new Error("--fixture is allowed only with --env local");
  }
  return { environment, fixture, from, to };
}

async function readFixture(filename: string): Promise<ProductEventRow[]> {
  const parsed: unknown = JSON.parse(await readFile(filename, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Fixture must contain a JSON array");
  return parsed as ProductEventRow[];
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);
  const window = parseWindow(options.from, options.to);
  const rows = options.fixture
    ? await readFixture(options.fixture)
    : await fetchProductEvents(options.environment, window);
  console.log(JSON.stringify(aggregateWeeklyFunnel(rows, options), null, 2));
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error: unknown) => {
    if (error instanceof Error && error.message === "help") return;
    console.error(error instanceof Error ? error.message : "Weekly funnel report failed");
    process.exitCode = 1;
  });
}
