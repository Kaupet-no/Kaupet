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

/** A group is emitted only when every non-zero cell has at least this many sessions. */
export const SMALL_CELL_THRESHOLD = 5;

export type ProductEventRow = {
  session_id: unknown;
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
type SearchState = {
  opened: Set<string>;
  pageViewed: Set<string>;
  submitted: Set<string>;
  zeroResults: Set<string>;
  zeroResultRecovery: Set<string>;
  filterOpened: Set<string>;
  filterApplied: Set<string>;
  filterCancelled: Set<string>;
  suggestions: Set<string>;
  mapOpened: Set<string>;
  saved: Set<string>;
  resultOpened: Set<string>;
  listingOpened: Set<string>;
  contactStarted: Set<string>;
};
type ComposerStepState = { viewed: Set<string>; completed: Set<string> };
type ComposerState = {
  started: Set<string>;
  published: Set<string>;
  steps: Map<string, ComposerStepState>;
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

function searchState(): SearchState {
  return {
    opened: new Set(),
    pageViewed: new Set(),
    submitted: new Set(),
    zeroResults: new Set(),
    zeroResultRecovery: new Set(),
    filterOpened: new Set(),
    filterApplied: new Set(),
    filterCancelled: new Set(),
    suggestions: new Set(),
    mapOpened: new Set(),
    saved: new Set(),
    resultOpened: new Set(),
    listingOpened: new Set(),
    contactStarted: new Set(),
  };
}

function composerState(): ComposerState {
  return { started: new Set(), published: new Set(), steps: new Map() };
}

function intersection(...sets: ReadonlySet<string>[]): Set<string> {
  const result = new Set<string>();
  const first = sets[0];
  if (!first) return result;
  const rest = sets.slice(1);
  for (const value of first) {
    if (rest.every((set) => set.has(value))) result.add(value);
  }
  return result;
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
 * Counts distinct anonymous sessions by safe dimensions. Receive order is deliberately ignored:
 * fire-and-forget events can arrive out of order, and duplicate rows collapse into the same sets.
 */
export function aggregateWeeklyFunnel(
  rows: readonly ProductEventRow[],
  options: { environment: Environment; from: string; to: string },
) {
  const window = parseWindow(options.from, options.to);
  const search = new Map<Platform, SearchState>();
  const composer = new Map<string, { platform: Platform; kind: Kind; state: ComposerState }>();

  for (const row of rows) {
    if (
      typeof row.session_id !== "string" ||
      !isPlatform(row.platform) ||
      !inWindow(row.created_at, window)
    ) {
      continue;
    }

    const session = row.session_id;
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
      const state = search.get(row.platform) ?? searchState();
      search.set(row.platform, state);
      if (row.event_name === "search_opened") state.opened.add(session);
      if (row.event_name === "search_page_viewed") state.pageViewed.add(session);
      if (row.event_name === "search_submitted") state.submitted.add(session);
      if (row.event_name === "search_zero_results") state.zeroResults.add(session);
      if (row.event_name === "search_zero_results_recovered") state.zeroResultRecovery.add(session);
      if (row.event_name === "search_filter_opened") state.filterOpened.add(session);
      if (row.event_name === "search_filter_applied") state.filterApplied.add(session);
      if (row.event_name === "search_filter_cancelled") state.filterCancelled.add(session);
      if (row.event_name === "search_suggestion_selected") state.suggestions.add(session);
      if (row.event_name === "search_map_opened") state.mapOpened.add(session);
      if (row.event_name === "search_saved") state.saved.add(session);
      if (row.event_name === "search_result_opened") state.resultOpened.add(session);
      if (row.event_name === "listing_opened") state.listingOpened.add(session);
      if (row.event_name === "contact_started") state.contactStarted.add(session);
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
      state: composerState(),
    };
    composer.set(key, group);
    if (row.event_name === "listing_creation_started") group.state.started.add(session);
    if (row.event_name === "listing_published") group.state.published.add(session);
    if (row.event_name !== "listing_creation_step_completed") continue;

    const step = normalizeStep(row.step);
    if (!step || (row.action !== "viewed" && row.action !== "completed")) continue;
    const stepState = group.state.steps.get(step) ?? { viewed: new Set(), completed: new Set() };
    group.state.steps.set(step, stepState);
    stepState[row.action].add(session);
  }

  let suppressedSearchGroups = 0;
  const searchReport = PLATFORMS.flatMap((platform) => {
    const state = search.get(platform);
    if (!state) return [];
    const pageViewed = state.pageViewed;
    const opened = new Set([...state.opened, ...pageViewed]);
    const submitted = intersection(opened, state.submitted);
    const zeroResults = intersection(submitted, state.zeroResults);
    const filterOpened = intersection(submitted, state.filterOpened);
    const filterApplied = intersection(submitted, state.filterApplied);
    const filterCancelled = intersection(submitted, state.filterCancelled);
    const suggestions = intersection(submitted, state.suggestions);
    const zeroResultRecovery = intersection(submitted, state.zeroResultRecovery);
    const mapOpened = intersection(submitted, state.mapOpened);
    const saved = intersection(submitted, state.saved);
    const resultOpened = intersection(submitted, state.resultOpened);
    const listingOpened = intersection(submitted, state.listingOpened);
    const contactStarted = intersection(listingOpened, state.contactStarted);
    const counts = [
      opened.size,
      submitted.size,
      zeroResults.size,
      listingOpened.size,
      contactStarted.size,
    ];
    if (opened.size === 0) return [];
    if (isSmallCell(counts)) {
      suppressedSearchGroups += 1;
      return [];
    }
    return [
      {
        platform,
        pageViewed: pageViewed.size,
        opened: opened.size,
        submitted: submitted.size,
        submissionRate: rate(submitted.size, opened.size),
        filterOpened: filterOpened.size,
        filterApplied: filterApplied.size,
        filterCancelled: filterCancelled.size,
        suggestions: suggestions.size,
        zeroResults: zeroResults.size,
        zeroResultRate: rate(zeroResults.size, submitted.size),
        zeroResultRecovery: zeroResultRecovery.size,
        mapOpened: mapOpened.size,
        saved: saved.size,
        resultOpened: resultOpened.size,
        listingOpened: listingOpened.size,
        listingOpenRate: rate(listingOpened.size, submitted.size),
        contactStarted: contactStarted.size,
        contactStartRate: rate(contactStarted.size, listingOpened.size),
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
      const published = intersection(started, state.published);
      if (started.size === 0) return [];
      if (isSmallCell([started.size, published.size])) {
        suppressedComposerGroups += 1;
        return [];
      }

      const steps = [...state.steps.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([step, stepState]) => {
          const viewed = intersection(started, stepState.viewed);
          const completed = intersection(viewed, stepState.completed);
          if (viewed.size === 0) return [];
          if (isSmallCell([viewed.size, completed.size])) {
            suppressedComposerStepGroups += 1;
            return [];
          }
          return [
            {
              step,
              viewed: viewed.size,
              viewRate: rate(viewed.size, started.size),
              completed: completed.size,
              completionRate: rate(completed.size, viewed.size),
            },
          ];
        });

      return [
        {
          platform,
          kind,
          started: started.size,
          published: published.size,
          publishRate: rate(published.size, started.size),
          steps,
        },
      ];
    });

  return {
    schemaVersion: 1,
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
    limitations: ["environment_marker_missing", "journey_id_missing"] as const,
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
        "session_id,event_name,platform,created_at,kind:properties->>kind,action:properties->>action,step:properties->>step",
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
