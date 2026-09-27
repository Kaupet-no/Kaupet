// TanStack Start-serverfunksjoner for opplasting/sletting av bilder i R2.
//
// Filoverføring: FormData, ikke base64 (som i vehicle-360.functions.ts).
// TanStack Start støtter FormData som validator-input for POST-serverfunksjoner
// (klienten sender multipart, serveren rekonstruerer en ekte FormData med
// File-verdier før validatoren kjører — se server-functions-handler i
// @tanstack/start-server-core). Det unngår 33 %-overhead og
// tekst-en/dekoding fra base64, som ikke gir noen fordel her siden det ikke
// finnes en token-only, sesjonsløs klient for disse opplastingene (i
// motsetning til 360-opptak, som bruker base64 nettopp fordi det sendes fra
// en uinnlogget mobilklient som ikke kan gjøre multipart mot en
// autentisert serverfunksjon på samme måte).
//
// Størrelsesgrensen håndheves i handleren rett etter at valideringen av
// selve feltene er gjort, før noe når R2 — men multipart-bodyen er allerede
// lest/bufret av rammeverket når validatoren kjører (samme begrensning
// gjelder base64-mønsteret: JSON-bodyen er allerede parset før zod ser
// lengden). Å håndheve grensen før hele forespørselen bufres krever en
// global body size-grense på serveren (nitro/Workers-nivå), som ikke finnes
// i dette repoet i dag og er utenfor denne oppgaven.
//
// Autorisasjon: annonsebilder sjekkes via RPC-en `can_upload_listing_image`
// (supabase/migrations/20260918100000_can_upload_listing_image.sql), som
// speiler `listing_images_write`/`listing_images_delete`-policyene i
// 20260902150000_storage_bucket_policies.sql. Avatar og organisasjonslogo
// bruker samme regler som `avatars_owner_insert` og
// `organization_logos_superuser_insert` krevde før migreringen til R2 — se
// kommentarene ved hver funksjon.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deleteObject, presignGetUrl, putObject } from "@/lib/r2.server";
import { pathFromPublicImageUrl, publicImageUrl } from "@/lib/image-url";
import {
  ATTACHMENT_URL_TTL_SECONDS,
  describeImageError,
  extFromMime,
  MAX_ATTACHMENT_PATHS_PER_REQUEST,
  thumbPathFor,
  validateImages,
} from "@/lib/storage";

// {id}/{uuid}.{ext} — samme mønster for annonsebilder (id = listingId, se
// `thumbPathFor` for thumbnail-varianten) og meldingsvedlegg (id =
// conversationId, se uploadMessageAttachment).
const UUID_DIR_UUID_FILE_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|jxl)$/i;

function assertServerSideImage(file: File): void {
  const err = validateImages([file]);
  if (err) throw new Error(describeImageError(err));
}

function listingIdFromValidatedPath(path: string): string {
  return path.split("/", 1)[0];
}

export const uploadListingImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const listingId = formData.get("listingId");
    const file = formData.get("file");
    if (typeof listingId !== "string" || !z.string().uuid().safeParse(listingId).success) {
      throw new Error("Ugyldig annonse-id");
    }
    if (!(file instanceof File)) throw new Error("Mangler bildefil");
    return { listingId, file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const { data: allowed, error } = await context.supabase.rpc("can_upload_listing_image", {
      _listing_id: data.listingId,
    });
    if (error) throw new Error("Kunne ikke sjekke tilgang til annonsen");
    if (!allowed) throw new Error("Du har ikke tilgang til å laste opp bilder til denne annonsen");

    const key = `${data.listingId}/${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await putObject("BILDER", key, await data.file.arrayBuffer(), data.file.type);
    return { path: key };
  });

export const uploadListingImageThumb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const path = formData.get("path");
    const file = formData.get("file");
    if (typeof path !== "string" || !UUID_DIR_UUID_FILE_PATH_RE.test(path)) {
      throw new Error("Ugyldig bildesti");
    }
    if (!(file instanceof File)) throw new Error("Mangler miniatyrbilde");
    return { path, file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const listingId = listingIdFromValidatedPath(data.path);
    const { data: allowed, error } = await context.supabase.rpc("can_upload_listing_image", {
      _listing_id: listingId,
    });
    if (error) throw new Error("Kunne ikke sjekke tilgang til annonsen");
    if (!allowed) throw new Error("Du har ikke tilgang til å laste opp bilder til denne annonsen");

    await putObject(
      "BILDER",
      thumbPathFor(data.path),
      await data.file.arrayBuffer(),
      data.file.type,
    );
    return { ok: true as const };
  });

export const deleteListingImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ path: z.string().regex(UUID_DIR_UUID_FILE_PATH_RE, "Ugyldig bildesti") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const listingId = listingIdFromValidatedPath(data.path);
    // Samme betingelser som skrive-policyen (se can_upload_listing_image) —
    // listing_images_write og listing_images_delete var identiske i SQL-en
    // som ble erstattet.
    const { data: allowed, error } = await context.supabase.rpc("can_upload_listing_image", {
      _listing_id: listingId,
    });
    if (error) throw new Error("Kunne ikke sjekke tilgang til annonsen");
    if (!allowed) throw new Error("Du har ikke tilgang til å slette dette bildet");

    await deleteObject("BILDER", data.path);
    await deleteObject("BILDER", thumbPathFor(data.path)).catch(() => {
      // Best-effort — eldre bilder har ikke nødvendigvis en thumbnail.
    });
    return { ok: true as const };
  });

// Avatar-bucketen er offentlig og eies av brukeren selv (avatars_owner_insert
// krevde bare at første path-segment var auth.uid()). Nøkkelen bygges her fra
// context.userId (fra den autentiserte sesjonen), aldri fra klientinput, så
// det er ingen ekstra tilgangssjekk å gjøre utover autentisering.
export const uploadAvatarImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Mangler bildefil");
    return { file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);
    const key = `${context.userId}/avatar-${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await putObject("BILDER", key, await data.file.arrayBuffer(), data.file.type);
    return { url: publicImageUrl(key) };
  });

export const deletePreviousAvatarImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ previousPublicUrl: z.string().min(1).nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.previousPublicUrl) return { ok: true as const };
    const path = pathFromPublicImageUrl(data.previousPublicUrl);
    // Path-eierskap er den eneste autorisasjonen avatars_owner_delete krevde
    // — så vi håndhever nøyaktig det samme her, selv om dette er best-effort
    // opprydning (feil svelges, avataren er allerede byttet ut).
    if (!path || path.split("/", 1)[0] !== context.userId) return { ok: true as const };
    await deleteObject("BILDER", path).catch(() => {});
    return { ok: true as const };
  });

// organization_logos_superuser_insert krevde at brukeren var aktiv superuser
// for organisasjonen OG at organisasjonen hadde Proff-tilgang. Begge RPC-ene
// er allerede GRANT EXECUTE'd til `authenticated`
// (20260901140000_business_accounts.sql), så ingen ny migrasjon trengs.
export const uploadOrganizationLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const organizationId = formData.get("organizationId");
    const file = formData.get("file");
    if (
      typeof organizationId !== "string" ||
      !z.string().uuid().safeParse(organizationId).success
    ) {
      throw new Error("Ugyldig organisasjons-id");
    }
    if (!(file instanceof File)) throw new Error("Mangler logofil");
    // «contact» = profilbilde for en kontaktperson (Proff), ellers logo.
    const kind = formData.get("kind") === "contact" ? "contact" : "logo";
    return { organizationId, file, kind };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const [superuserResult, proffResult] = await Promise.all([
      context.supabase.rpc("is_organization_superuser", { _organization_id: data.organizationId }),
      context.supabase.rpc("organization_has_proff_access", {
        _organization_id: data.organizationId,
      }),
    ]);
    if (superuserResult.error || proffResult.error) throw new Error("Kunne ikke sjekke tilgang");
    if (!superuserResult.data || !proffResult.data) {
      throw new Error("Du har ikke tilgang til å laste opp logo for denne organisasjonen");
    }

    const key = `${data.organizationId}/${data.kind}-${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await putObject("BILDER", key, await data.file.arrayBuffer(), data.file.type);
    return { path: key };
  });

export const deletePreviousOrganizationLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ previousPath: z.string().min(1).nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.previousPath) return { ok: true as const };
    const organizationId = data.previousPath.split("/", 1)[0];
    const [superuserResult, proffResult] = await Promise.all([
      context.supabase.rpc("is_organization_superuser", { _organization_id: organizationId }),
      context.supabase.rpc("organization_has_proff_access", { _organization_id: organizationId }),
    ]);
    // Best-effort opprydning — svikter tilgangssjekken (feil path, ikke lenger
    // superuser), lar vi bare den gamle logoen ligge igjen fremfor å kaste.
    if (superuserResult.error || proffResult.error || !superuserResult.data || !proffResult.data) {
      return { ok: true as const };
    }
    await deleteObject("BILDER", data.previousPath).catch(() => {});
    return { ok: true as const };
  });

// Meldingsvedlegg ligger i den private VEDLEGG-bucketen. Autorisasjon
// speiler message_attachments_participant_insert/_read
// (20260902150000_storage_bucket_policies.sql): brukeren må være buyer_id
// eller seller_id i samtalen som første path-segment peker på. Se
// blocks.functions.ts (createBlock) for samme oppslagsmønster mot
// conversations.
export const uploadMessageAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((formData: FormData) => {
    const conversationId = formData.get("conversationId");
    const file = formData.get("file");
    if (
      typeof conversationId !== "string" ||
      !z.string().uuid().safeParse(conversationId).success
    ) {
      throw new Error("Ugyldig samtale-id");
    }
    if (!(file instanceof File)) throw new Error("Mangler vedleggsfil");
    return { conversationId, file };
  })
  .handler(async ({ data, context }) => {
    assertServerSideImage(data.file);

    const { data: conv, error } = await context.supabase
      .from("conversations")
      .select("id, buyer_id, seller_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error("Kunne ikke sjekke tilgang til samtalen");
    if (!conv || (conv.buyer_id !== context.userId && conv.seller_id !== context.userId)) {
      throw new Error("Du er ikke deltaker i denne samtalen");
    }

    const key = `${data.conversationId}/${crypto.randomUUID()}.${extFromMime(data.file.type)}`;
    await putObject("VEDLEGG", key, await data.file.arrayBuffer(), data.file.type);
    return { path: key };
  });

// Returnerer presignerte GET-URL-er kun for stiene brukeren faktisk har
// tilgang til (deltaker i samtalen — se uploadMessageAttachment). Stier
// brukeren ikke har tilgang til utelates i stedet for å kaste, siden en
// liste kan inneholde vedlegg fra flere samtaler.
export const signMessageAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        // Grense for å hindre at en klient sender vilkårlig mange stier inn i
        // én `.in()`-spørring og presign-løkke.
        paths: z
          .array(z.string().regex(UUID_DIR_UUID_FILE_PATH_RE))
          .max(MAX_ATTACHMENT_PATHS_PER_REQUEST, "For mange vedlegg i én forespørsel"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    const conversationIds = Array.from(new Set(data.paths.map((p) => p.split("/", 1)[0])));
    if (conversationIds.length === 0) return {};

    const { data: convs, error } = await context.supabase
      .from("conversations")
      .select("id, buyer_id, seller_id")
      .in("id", conversationIds);
    if (error) throw new Error("Kunne ikke sjekke tilgang til samtalene");

    const allowedConversationIds = new Set(
      (convs ?? [])
        .filter((c) => c.buyer_id === context.userId || c.seller_id === context.userId)
        .map((c) => c.id),
    );

    const allowedPaths = data.paths.filter((p) => allowedConversationIds.has(p.split("/", 1)[0]));
    const urls = await Promise.all(
      allowedPaths.map((path) => presignGetUrl("VEDLEGG", path, ATTACHMENT_URL_TTL_SECONDS)),
    );
    return Object.fromEntries(allowedPaths.map((path, i) => [path, urls[i]]));
  });
