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

type PhotoSuggestionStatus = "idle" | "analyzing" | "ok" | "unavailable";

/**
 * Client-side state machine for the photo-assisted category/attribute
 * suggestion action (see
 * docs/decisions/2026-09-04-photo-assisted-listing-suggestions.md § 2). One
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

  const revision = `${images.map((image) => image.id).join(",")}|${title.trim()}`;
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentedRevision, setConsentedRevision] = useState<string | null>(null);
  const [status, setStatus] = useState<PhotoSuggestionStatus>("idle");
  const [categorySuggestions, setCategorySuggestions] = useState<PhotoCategorySuggestion[]>([]);
  const [titleSuggestion, setTitleSuggestion] = useState<string | null>(null);
  const [attributeSuggestionLoading, setAttributeSuggestionLoading] = useState(false);

  // Derived-state-on-prop-change (React's own pattern — state, not a ref, so
  // it's safe to read/write during render): reset everything tied to the
  // previous inputRevision the moment images or title change, per brief § 5
  // ("avviste forslag vises ikke igjen før inputRevision endres" applies
  // symmetrically to accepted ones — a stale suggestion for a different
  // photo set/title must never linger).
  const [seenRevision, setSeenRevision] = useState(revision);
  if (seenRevision !== revision) {
    setSeenRevision(revision);
    setConsentedRevision(null);
    setStatus("idle");
    setCategorySuggestions([]);
    setTitleSuggestion(null);
  }

  async function confirmConsent() {
    setConsentOpen(false);
    setConsentedRevision(revision);
    setStatus("analyzing");
    try {
      const prepared = await preparePhotoSuggestionImages(
        images.map((image) => image.file),
        "identify",
      );
      const token = await turnstileRef.current?.getResponsePromise();
      if (prepared.length === 0 || !token) {
        setStatus("unavailable");
        return;
      }
      const result = await suggestListingFromPhotos({
        data: {
          operation: "identify",
          images: prepared,
          title: title.trim() || undefined,
          turnstileToken: token,
        },
      });
      turnstileRef.current?.reset();
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
      const token = await turnstileRef.current?.getResponsePromise();
      if (prepared.length === 0 || !token) return [];
      const result = await suggestListingFromPhotos({
        data: { operation: "attributes", images: prepared, categorySlug, turnstileToken: token },
      });
      turnstileRef.current?.reset();
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
    status,
    consentOpen,
    openConsent: () => setConsentOpen(true),
    closeConsent: () => setConsentOpen(false),
    confirmConsent,
    categorySuggestions,
    titleSuggestion,
    dismissTitleSuggestion: () => setTitleSuggestion(null),
    canRequestAttributes,
    attributeSuggestionLoading,
    requestAttributeSuggestions,
  };
}
