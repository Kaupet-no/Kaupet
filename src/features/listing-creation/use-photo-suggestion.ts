import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

import {
  getPhotoSuggestionAvailability,
  suggestListingFromPhotos,
} from "@/lib/category-suggestion.functions";
import { preparePhotoSuggestionImages } from "@/lib/photo-suggestion-images";
import type { PendingImage } from "@/components/image-uploader";

export type PhotoCategorySuggestion = {
  category_id: string;
  parent_id: string | null;
  name_nb: string;
  parent_name_nb: string | null;
};

type PhotoSuggestionStatus =
  "idle" | "analyzing" | "verifying" | "verification-required" | "ok" | "unavailable";

/**
 * Client-side state machine for the photo-assisted category/attribute
 * suggestion action. One
 * instance lives in ny-annonse.tsx for the whole wizard, since the same
 * Turnstile token/consent needs to reach both the "photos" step (identify)
 * and the "Om tingen" step (attributes) — passing the resulting functions
 * down via WizardSharedProps rather than re-deriving state per step.
 *
 * "inputRevision" (brief § 2/§ 5) is images + title only, not category: the
 * category is exactly what `identify` is still figuring out when consent is
 * asked, so it can't be part of the consent snapshot. Once the user accepts
 * or picks a category, the consent from the same images+title still covers
 * the follow-up "Foreslå detaljer" call.
 */
export function usePhotoSuggestion(params: { images: PendingImage[]; title: string }) {
  const { images, title } = params;

  const { data: availability } = useQuery({
    queryKey: ["photo-suggestion-availability"],
    queryFn: () => getPhotoSuggestionAvailability(),
    staleTime: 5 * 60_000,
  });
  // The server requires a non-empty Turnstile token for every call (unlike
  // the publish flow, which tolerates a missing one) — without a site key
  // there is no way to obtain one, so the action must stay hidden rather
  // than offer a button that always fails.
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const enabled = !!availability?.enabled && turnstileEnabled;

  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const imagesKey = images.map((image) => image.id).join(",");
  const revision = `${imagesKey}|${title.trim()}`;
  const [consentedRevision, setConsentedRevision] = useState<string | null>(null);
  const [status, setStatus] = useState<PhotoSuggestionStatus>("idle");
  const [categorySuggestions, setCategorySuggestions] = useState<PhotoCategorySuggestion[]>([]);
  const [titleSuggestion, setTitleSuggestion] = useState<string | null>(null);
  const [attributeSuggestionLoading, setAttributeSuggestionLoading] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);

  // Derived-state-on-prop-change (React's own pattern — state, not a ref, so
  // it's safe to read/write during render): reset everything tied to the
  // previous inputRevision the moment images or title change, per brief § 5
  // ("avviste forslag vises ikke igjen før inputRevision endres" applies
  // symmetrically to accepted ones — a stale suggestion for a different
  // photo set/title must never linger).
  const [seenRevision, setSeenRevision] = useState(revision);
  // Revisjonen som tittelforslaget selv sist skrev inn i feltet (via
  // applyTitleSuggestion): den påfølgende tittelendringen er systemets egen
  // utfylling, ikke ny brukerinput, og skal ikke nullstille forslagene.
  const [selfAppliedRevision, setSelfAppliedRevision] = useState<string | null>(null);
  if (seenRevision !== revision) {
    if (selfAppliedRevision === revision) {
      // Tittelforslaget ble skrevet inn i feltet: behold kategoriforslaget,
      // og la samtykket følge med over på den nye tittelen (den er generert
      // av samme bilder som samtykket gjaldt).
      setSeenRevision(revision);
      setSelfAppliedRevision(null);
      setConsentedRevision((current) => (current === seenRevision ? revision : current));
    } else {
      setSeenRevision(revision);
      setConsentedRevision(null);
      setStatus("idle");
      setCategorySuggestions([]);
      setTitleSuggestion(null);
      setSelfAppliedRevision(null);
    }
  }

  async function getVerifiedToken() {
    try {
      const token = await turnstileRef.current?.getResponsePromise();
      if (token) {
        setVerificationNeeded(false);
        return token;
      }
    } catch {
      // Cloudflare may still be waiting for the user's checkbox.
    }
    setVerificationNeeded(true);
    return null;
  }

  // Turnstile-tokens er engangs, og widgeten deles av bildeforslaget og
  // tittelens KI-kategoriforslag (ny-annonse.tsx). Ett token deles ut om
  // gangen, og widgeten nullstilles straks, så to samtidige kall aldri får
  // samme token. Uten token (avkrysning gjenstår) står widgeten urørt. Har
  // kalleren gitt opp (timeoutMs), brukes ikke tokenet som kommer senere —
  // widgeten nullstilles ikke, så neste kall får det ubrukte tokenet.
  const tokenQueue = useRef<Promise<unknown>>(Promise.resolve());
  function takeVerifiedToken(timeoutMs?: number): Promise<string | null> {
    let abandoned = false;
    const turn = tokenQueue.current.then(async () => {
      const token = await getVerifiedToken();
      if (!token || abandoned) return null;
      turnstileRef.current?.reset();
      return token;
    });
    tokenQueue.current = turn;
    if (timeoutMs === undefined) return turn;
    let timer: number | undefined;
    return Promise.race([
      turn,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => {
          abandoned = true;
          resolve(null);
        }, timeoutMs);
      }),
    ]).finally(() => window.clearTimeout(timer));
  }

  // Trykket på knappen er samtykket: hjelpeteksten under den forklarer KI-
  // bruken og lenker til personvernerklæringen.
  async function analyzePhotos() {
    setConsentedRevision(revision);
    setStatus("analyzing");
    try {
      const prepared = await preparePhotoSuggestionImages(
        images.map((image) => image.file),
        "identify",
      );
      if (prepared.length === 0) {
        setStatus("unavailable");
        return;
      }
      const token = await takeVerifiedToken();
      if (!token) {
        setStatus("verification-required");
        return;
      }
      setStatus("analyzing");
      const result = await suggestListingFromPhotos({
        data: {
          operation: "identify",
          images: prepared,
          title: title.trim() || undefined,
          turnstileToken: token,
        },
      });
      if (
        result.status !== "unavailable" &&
        "categories" in result &&
        result.categories.length > 0
      ) {
        setCategorySuggestions(result.categories);
        setTitleSuggestion(result.title ?? null);
        setStatus("ok");
      } else {
        setStatus("unavailable");
      }
    } catch {
      setStatus("unavailable");
    }
  }

  /** Melder at tittelforslaget er skrevet inn i skjemaet (automatisk
   * utfylling av et tomt felt, eller «Bruk»-knappen): lukker tittelforslaget
   * og registrerer revisjonen, slik at input-resettiingen over adopterer den
   * påfølgende tittelendringen i stedet for å forkaste kategoriforslaget og
   * samtykket. */
  function applyTitleSuggestion(value: string) {
    setTitleSuggestion(null);
    setSelfAppliedRevision(`${imagesKey}|${value.trim()}`);
  }

  /** True once consent covers the current images+title — the gate for
   * showing "Foreslå detaljer fra bildene" on the category-attributes step,
   * regardless of whether `identify` itself found a category. */
  const canRequestAttributes = enabled && consentedRevision === revision;

  async function requestAttributeSuggestions(
    categorySlug: string,
  ): Promise<{ key: string; value: string | number | boolean }[]> {
    if (!canRequestAttributes) return [];
    setAttributeSuggestionLoading(true);
    try {
      const prepared = await preparePhotoSuggestionImages(
        images.map((image) => image.file),
        "attributes",
      );
      if (prepared.length === 0) return [];
      const token = await takeVerifiedToken();
      if (!token) return [];
      const result = await suggestListingFromPhotos({
        data: { operation: "attributes", images: prepared, categorySlug, turnstileToken: token },
      });
      return result.status !== "unavailable" && Array.isArray(result.attributes)
        ? result.attributes
        : [];
    } catch {
      return [];
    } finally {
      setAttributeSuggestionLoading(false);
    }
  }

  return {
    enabled,
    turnstileEnabled,
    turnstileRef,
    takeVerifiedToken,
    verificationNeeded,
    onBeforeInteractive: () => {
      setVerificationNeeded(true);
      setStatus((current) => (current === "analyzing" ? "verifying" : current));
    },
    onSuccess: () => {
      setVerificationNeeded(false);
      setStatus((current) => (current === "verification-required" ? "idle" : current));
    },
    status,
    analyzePhotos,
    categorySuggestions,
    titleSuggestion,
    applyTitleSuggestion,
    canRequestAttributes,
    attributeSuggestionLoading,
    requestAttributeSuggestions,
  };
}
