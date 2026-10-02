import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getRequest } from "@tanstack/react-start/server";
import { getSupabaseServerClient } from "@/integrations/supabase/session.server";
import { classifyVehicleCategory } from "@/lib/vehicle/vehicle-classification";
import { isValidVehicleRegistrationNumber } from "@/lib/vehicle/vehicle-registration";
import { assertNotRateLimited, assertUserNotRateLimited } from "@/lib/rate-limit.server";

const MAX_LOOKUPS_PER_HOUR = 20;
const LOOKUP_LIMIT_MESSAGE =
  "For mange kjøretøyoppslag den siste timen. Fyll inn kjøretøyopplysningene manuelt i mellomtiden.";

/** Innlogget bruker hvis det finnes en sesjon, ellers null. Gjester skal kunne
 * påbegynne en annonse (og slå opp skiltet) før de blir bedt om å logge inn
 * ved publisering. Bearer-headeren (attachSupabaseAuth, også native) går
 * foran kapselsesjonen. */
async function getOptionalUserId(): Promise<string | null> {
  const token = getRequest()
    ?.headers.get("authorization")
    ?.replace(/^Bearer /, "");
  const { data } = await getSupabaseServerClient().auth.getClaims(token || undefined);
  return data?.claims?.sub ?? null;
}

export const lookupVehicleByRegNumber = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        registrationNumber: z
          .string()
          .trim()
          .refine(isValidVehicleRegistrationNumber, "Skriv inn et gyldig registreringsnummer."),
        // Optional: at the "Bil og MC"-first lookup, the leaf category (and
        // therefore the brand group) isn't known yet, so brand/model
        // matching below is skipped — brandMatch/modelMatch come back null.
        categoryGroup: z
          .enum([
            "bil",
            "motorsykkel",
            "moped_atv",
            "bobil_campingvogn",
            "henger",
            "lastebil",
            "buss",
            "traktor",
            "anleggsmaskin",
          ])
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabaseAdmin = await getSupabaseAdmin();
    const { lookupVehicle } = await import("@/lib/vehicle/vehicle-lookup.server");
    const { matchVehicleBrandAndModel } =
      await import("@/lib/vehicle/vehicle-brand-match.functions");
    const userId = await getOptionalUserId();

    // ponytail: gjester begrenses per IP (CGNAT deler IP). Krev Turnstile for
    // gjester hvis SVV-kvoten misbrukes.
    if (userId) {
      await assertUserNotRateLimited(
        userId,
        "vehicle_lookup",
        MAX_LOOKUPS_PER_HOUR,
        3600,
        LOOKUP_LIMIT_MESSAGE,
      );
    } else {
      await assertNotRateLimited(
        "vehicle_lookup_guest",
        MAX_LOOKUPS_PER_HOUR,
        3600,
        LOOKUP_LIMIT_MESSAGE,
      );
    }

    const result = await lookupVehicle(data.registrationNumber);
    const classification = classifyVehicleCategory(
      result.classification_code,
      result.avgiftsklasse_code,
      result.body_type_hint,
      result.sleeping_places,
    );

    // Personlige kjennemerker kan overføres mellom kjøretøy av ulik klasse —
    // varsle (mykt, ikke blokkerende) hvis samme bruker har slått opp samme
    // skilt før med en annen utledet kjøretøytype.
    let previousClassificationMismatch: { slug: string | null; lookedUpAt: string } | null = null;
    if (userId && classification.slug) {
      const { data: previous } = await supabaseAdmin
        .from("vehicle_lookup_log")
        .select("classification_result, created_at")
        .eq("user_id", userId)
        .eq("registration_number", result.registrationNumber)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousSlug = (previous?.classification_result as { slug?: string | null } | null)
        ?.slug;
      if (previousSlug && previousSlug !== classification.slug) {
        previousClassificationMismatch = { slug: previousSlug, lookedUpAt: previous!.created_at };
      }
    }

    if (userId) {
      await supabaseAdmin.from("vehicle_lookup_log").insert({
        user_id: userId,
        registration_number: result.registrationNumber,
        classification_result: classification,
      });
    }

    let brandMatch: { id: string; name: string } | null = null;
    let modelMatch: { id: string; name: string } | null = null;

    if (data.categoryGroup) {
      const matched = await matchVehicleBrandAndModel(
        supabaseAdmin,
        result.brand,
        result.model,
        data.categoryGroup,
      );
      brandMatch = matched.brandMatch;
      modelMatch = matched.modelMatch;
    }

    return { lookup: result, brandMatch, modelMatch, previousClassificationMismatch };
  });
