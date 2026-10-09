import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

import { supabase } from "@/integrations/supabase/client";
import { createListing } from "@/lib/listings.functions";
import { uploadListingImage, uploadListingImageThumb } from "@/lib/storage";
import { geocodeNorwayAddress } from "@/lib/geocode";
import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { trackProductEvent } from "@/lib/product-analytics";
import type { PendingImage } from "@/components/image-uploader";
import type { AttributeMap } from "@/components/attribute-fields";
import type { CategoryBehavior } from "@/lib/category-behavior";

import type { ListingFormShape } from "./field-groups/types";

/**
 * Publiseringstilstanden til annonseveiviseren. Delt fra
 * usePublishListing fordi `publishedId` trengs tidlig (navigasjonsblokkeringen
 * `shouldBlockNav`), mens selve publiseringen trenger koordinater og utkast fra
 * hooks som først kalles senere.
 */
export function usePublishState() {
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [guestPublishSheetOpen, setGuestPublishSheetOpen] = useState(false);
  const publishAttemptPendingRef = useRef(false);
  const turnstileEnabled = !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  return {
    publishedId,
    setPublishedId,
    publishedCode,
    setPublishedCode,
    publishedOpen,
    setPublishedOpen,
    promoteOpen,
    setPromoteOpen,
    uploadProgress,
    setUploadProgress,
    guestPublishSheetOpen,
    setGuestPublishSheetOpen,
    publishAttemptPendingRef,
    turnstileEnabled,
    turnstileRef,
  };
}

type PublishState = ReturnType<typeof usePublishState>;

export function usePublishListing({
  state,
  images,
  attributes,
  coords,
  draftId,
  ownerId,
  ownerOrganizationId,
  preparePublish,
  resumeAutosave,
  isCurrent,
  clearDraftStorage,
  fieldGroupKeys,
  behavior,
  isVehicle,
  currentStepKey,
}: {
  state: PublishState;
  images: PendingImage[];
  attributes: AttributeMap;
  coords: { lat: number; lng: number } | null;
  draftId: string | null | undefined;
  ownerId: string | null;
  ownerOrganizationId: string | null;
  preparePublish: () => Promise<string>;
  resumeAutosave: () => void;
  isCurrent: () => boolean;
  clearDraftStorage: (options?: { stopAutosave?: boolean }) => void;
  fieldGroupKeys: string[];
  behavior: CategoryBehavior;
  isVehicle: boolean;
  currentStepKey: string;
}) {
  const navigate = useNavigate();
  const {
    publishedId,
    publishedCode,
    setPublishedId,
    setPublishedCode,
    setPublishedOpen,
    setUploadProgress,
    publishAttemptPendingRef,
    turnstileEnabled,
    turnstileRef,
  } = state;

  // Etter publisering havner brukeren på annonsen uansett hvordan dialogene
  // lukkes. /annonse/$listingId slår opp koden hvis svaret manglet den.
  function goToPublishedListing() {
    if (publishedCode) navigate({ to: "/$kaupetCode", params: { kaupetCode: publishedCode } });
    else if (publishedId)
      navigate({ to: "/annonse/$listingId", params: { listingId: publishedId } });
  }

  const mutation = useMutation({
    mutationFn: async (values: ListingFormShape) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Du må være logget inn.");

      if (!isCurrent() || userData.user.id !== ownerId)
        throw new Error("Kontoen er endret. Logg inn med opprinnelig konto.");
      const ensuredDraftId = await preparePublish();

      const finalCoords =
        coords ??
        (await geocodeNorwayAddress({
          postal_code: values.postal_code,
          city: values.city,
        }));

      // Bot-sjekken kjører i bakgrunnen så snart oppsummeringssiden vises, og
      // er normalt ferdig lenge før publiseringsklikket. Vi venter på tokenet
      // her i stedet for å låse Publiser-knappen, slik at en eventuell venting
      // skjer under den vanlige lastetilstanden.
      const turnstileToken = turnstileEnabled
        ? await turnstileRef.current?.getResponsePromise()
        : null;

      if (!isCurrent()) throw new Error("Kontoen er endret. Publiseringen er stoppet.");
      const listing = await createListing({
        data: {
          expected_user_id: ownerId!,
          expected_organization_id: ownerOrganizationId,
          draftId: ensuredDraftId ?? draftId!,
          title: values.title,
          subtitle: values.subtitle || null,
          description: values.description,
          category_id: values.category_id,
          condition: fieldGroupKeys.includes("condition") ? (values.condition ?? null) : null,
          is_free: values.is_free,
          price_nok: values.is_free
            ? null
            : typeof values.price_nok === "number"
              ? values.price_nok
              : null,
          postal_code: values.postal_code || null,
          city: values.city || null,
          lat: finalCoords?.lat ?? null,
          can_ship:
            fieldGroupKeys.includes("delivery") &&
            behavior.requiresDeliveryMethod &&
            values.can_ship != null
              ? values.can_ship !== "pickup"
              : null,
          lng: finalCoords?.lng ?? null,
          organization_location_id: values.organization_location_id ?? null,
          known_issues: isVehicle ? values.known_issues || null : null,
          no_known_issues: isVehicle ? !!values.no_known_issues : null,
          maintenance_history: isVehicle ? values.maintenance_history || null : null,
          attributes,
          turnstileToken,
        },
      });

      if (!isCurrent()) throw new Error("Kontoen er endret. Logg inn med opprinnelig konto.");
      // Upload images in parallel
      if (images.length > 0) {
        setUploadProgress({ done: 0, total: images.length });
        let done = 0;
        const thumbFailures: string[] = [];
        const thumbPromises: Promise<void>[] = [];
        const results = await Promise.all(
          images.map(async (img, i) => {
            const path = await uploadListingImage({ listingId: listing.id, file: img.file });
            // Best-effort: kortvisning faller tilbake til fullstørrelsesbildet
            // hvis thumbnailen mangler, så en feil her skal ikke stoppe
            // publiseringen — men samles opp og vises til brukeren etterpå.
            thumbPromises.push(
              uploadListingImageThumb({ path, file: img.thumbFile }).catch((err) => {
                console.warn("Kunne ikke laste opp kort-thumbnail", err);
                thumbFailures.push(img.file.name);
              }),
            );
            done += 1;
            setUploadProgress({ done, total: images.length });
            return { storage_path: path, sort_order: i, caption: img.caption?.trim() || null };
          }),
        );
        await Promise.all(thumbPromises);
        if (thumbFailures.length > 0) {
          showErrorToast(`Kunne ikke laste opp forhåndsvisning for: ${thumbFailures.join(", ")}`);
        }
        setUploadProgress(null);
        const { error: imgErr } = await supabase.from("listing_images").insert(
          results.map((u) => ({
            listing_id: listing.id,
            storage_path: u.storage_path,
            sort_order: u.sort_order,
            caption: u.caption,
          })),
        );
        if (imgErr) throw imgErr;
      }

      return listing;
    },
    onSuccess: (result) => {
      if (!isCurrent()) return;
      publishAttemptPendingRef.current = false;
      // stopAutosave: the wizard stays mounted behind the success dialog with
      // the form still populated — without this the next autosave tick would
      // INSERT the published listing back as a duplicate draft.
      clearDraftStorage({ stopAutosave: true });
      void import("@/lib/haptics").then((m) => m.hapticNotification("success"));
      setPublishedId(result.id);
      setPublishedCode(result.kaupet_code);
      setPublishedOpen(true);
    },
    onError: (err: Error) => {
      resumeAutosave();
      publishAttemptPendingRef.current = false;
      trackProductEvent("listing_publish_failed", { kind: "sell", step: currentStepKey });
      setUploadProgress(null);
      // Tokenet er engangsbruk — hent et nytt så neste forsøk ikke henger.
      turnstileRef.current?.reset();
      void import("@/lib/haptics").then((m) => m.hapticNotification("error"));
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen"));
    },
  });

  function publishOnce(values: ListingFormShape) {
    if (publishAttemptPendingRef.current) return;
    publishAttemptPendingRef.current = true;
    mutation.mutate(values);
  }

  return { mutation, publishOnce, goToPublishedListing };
}
