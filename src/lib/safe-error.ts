const CONTEXT_UUID_KEYS = new Set([
  "listing_id",
  "listingId",
  "userId",
  "promotion_id",
  "promotionId",
  "saleId",
  "jobId",
  "subscriptionId",
  "organizationId",
  "apiKeyId",
]);
const CONTEXT_NUMBER_KEYS = new Set(["httpStatus", "status", "attempts"]);
const SAFE_CODES = new Set([
  "23502",
  "23503",
  "23505",
  "23514",
  "22001",
  "22P02",
  "22023",
  "42501",
  "P0001",
  "PGRST116",
  "PGRST202",
  "PGRST204",
  "PGRST301",
  "PGRST302",
  "PGRST303",
]);

function safeCode(error: object): string | undefined {
  try {
    if (!("code" in error) || typeof error.code !== "string") return undefined;
    return SAFE_CODES.has(error.code) ? error.code : undefined;
  } catch {
    return undefined;
  }
}

/** A deliberately small descriptor: never includes an error message, stack, or cause. */
export function describeSafeError(error: unknown): {
  type: string;
  code?: string;
  status?: number;
} {
  try {
    let type = "unknown";
    if (error instanceof TypeError) type = "type";
    else if (error instanceof RangeError) type = "range";
    else if (error instanceof ReferenceError) type = "reference";
    else if (error instanceof SyntaxError) type = "syntax";
    else if (error instanceof Error) type = "error";
    const object = error !== null && typeof error === "object" ? error : undefined;
    let status: number | undefined;
    try {
      if (
        object &&
        "status" in object &&
        typeof object.status === "number" &&
        Number.isInteger(object.status) &&
        object.status >= 100 &&
        object.status <= 599
      )
        status = object.status;
    } catch {
      /* Ignore hostile getters on thrown objects. */
    }
    return {
      type,
      ...(object ? { code: safeCode(object) } : {}),
      ...(status === undefined ? {} : { status }),
    };
  } catch {
    return { type: "unknown" };
  }
}

/** Keep only fixed-key UUIDs and small integer counters/statuses. */
export function safeErrorContext(
  context?: Record<string, unknown>,
): Record<string, string | number> | null {
  if (!context) return null;
  const safe: Record<string, string | number> = {};
  try {
    for (const [key, value] of Object.entries(context)) {
      if (
        CONTEXT_UUID_KEYS.has(key) &&
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ) {
        safe[key] = value;
      } else if (
        CONTEXT_NUMBER_KEYS.has(key) &&
        typeof value === "number" &&
        Number.isInteger(value) &&
        (key === "attempts" ? value >= 0 && value <= 1_000_000 : value >= 100 && value <= 599)
      ) {
        safe[key] = value;
      }
    }
  } catch {
    return null;
  }
  return Object.keys(safe).length ? safe : null;
}
