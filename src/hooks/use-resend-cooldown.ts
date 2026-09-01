import { useCallback, useEffect, useState } from "react";

export const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

const RESEND_COOLDOWN_STORAGE_KEY = "kaupet_auth_resend_cooldown_until";

function readCooldownUntil(): number {
  if (typeof window === "undefined") return 0;

  try {
    const value = Number(window.localStorage.getItem(RESEND_COOLDOWN_STORAGE_KEY));
    if (!Number.isFinite(value) || value <= Date.now()) {
      window.localStorage.removeItem(RESEND_COOLDOWN_STORAGE_KEY);
      return 0;
    }
    return value;
  } catch {
    return 0;
  }
}

export function formatResendCooldown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function useResendCooldown() {
  const [cooldownUntil, setCooldownUntil] = useState(readCooldownUntil);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const update = () => {
      setCooldownUntil(readCooldownUntil());
      setNow(Date.now());
    };
    const interval = window.setInterval(update, 1000);
    window.addEventListener("storage", update);
    update();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", update);
    };
  }, []);

  const startCooldown = useCallback(() => {
    const until = Date.now() + RESEND_COOLDOWN_MS;
    try {
      window.localStorage.setItem(RESEND_COOLDOWN_STORAGE_KEY, String(until));
    } catch {
      // The in-memory state still protects the current page if storage is unavailable.
    }
    setCooldownUntil(until);
    setNow(Date.now());
  }, []);

  const secondsRemaining = now ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  return {
    isCoolingDown: secondsRemaining > 0,
    secondsRemaining,
    startCooldown,
  };
}
