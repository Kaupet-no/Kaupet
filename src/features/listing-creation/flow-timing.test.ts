import { describe, expect, it } from "vitest";
import { computeDurationMs } from "./flow-timing";

describe("computeDurationMs", () => {
  it("rounds to the nearest second", () => {
    const startedAt = 1_000_000;
    expect(computeDurationMs(startedAt, startedAt + 400)).toBe(0);
    expect(computeDurationMs(startedAt, startedAt + 600)).toBe(1000);
    expect(computeDurationMs(startedAt, startedAt + 62_400)).toBe(62_000);
  });

  it("never returns a negative duration for clock skew", () => {
    const startedAt = 1_000_000;
    expect(computeDurationMs(startedAt, startedAt - 500)).toBe(0);
  });
});
