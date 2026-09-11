// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatResendCooldown, RESEND_COOLDOWN_MS, useResendCooldown } from "./use-resend-cooldown";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useResendCooldown", () => {
  it("starts a persisted five-minute cooldown", () => {
    const { result } = renderHook(() => useResendCooldown());

    expect(result.current.isCoolingDown).toBe(false);

    act(() => result.current.startCooldown());

    expect(result.current.isCoolingDown).toBe(true);
    expect(result.current.secondsRemaining).toBe(300);
    expect(localStorage.getItem("kaupet_auth_resend_cooldown_until")).toBe(
      String(Date.now() + RESEND_COOLDOWN_MS),
    );

    const secondTab = renderHook(() => useResendCooldown());
    expect(secondTab.result.current.isCoolingDown).toBe(true);
  });

  it("counts down and unlocks after five minutes", () => {
    const { result } = renderHook(() => useResendCooldown());
    const startedAt = Date.now();

    act(() => result.current.startCooldown());
    act(() => {
      vi.setSystemTime(startedAt + 1000);
      window.dispatchEvent(new StorageEvent("storage"));
    });
    expect(result.current.secondsRemaining).toBe(299);

    act(() => {
      vi.setSystemTime(startedAt + RESEND_COOLDOWN_MS);
      window.dispatchEvent(new StorageEvent("storage"));
    });

    expect(result.current.isCoolingDown).toBe(false);
    expect(result.current.secondsRemaining).toBe(0);

    renderHook(() => useResendCooldown());
    expect(localStorage.getItem("kaupet_auth_resend_cooldown_until")).toBeNull();
  });
});

describe("formatResendCooldown", () => {
  it("formats minutes and seconds for the button label", () => {
    expect(formatResendCooldown(300)).toBe("5:00");
    expect(formatResendCooldown(299)).toBe("4:59");
    expect(formatResendCooldown(0)).toBe("0:00");
  });
});
