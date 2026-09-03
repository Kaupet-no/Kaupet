export type ListingInsightRow = {
  status: string;
  viewCount: number;
};

export type ListingInsightSummary = {
  active: number;
  inactive: number;
  lowViews: number;
  threshold: number;
};

export const DEFAULT_LISTING_VIEW_THRESHOLD = 10;
export const MAX_LISTING_VIEW_THRESHOLD = 1_000_000;

export function summarizeListingInsights(
  rows: readonly ListingInsightRow[],
  threshold: number,
): ListingInsightSummary {
  const safeThreshold =
    Number.isInteger(threshold) && threshold >= 0 && threshold <= MAX_LISTING_VIEW_THRESHOLD
      ? threshold
      : DEFAULT_LISTING_VIEW_THRESHOLD;
  const active = rows.filter((row) => row.status === "active").length;

  return {
    active,
    inactive: rows.length - active,
    lowViews: rows.filter((row) => row.viewCount < safeThreshold).length,
    threshold: safeThreshold,
  };
}
