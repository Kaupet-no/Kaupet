/**
 * Logger feil fra server-funksjoner til konsoll og til `error_log`-tabellen,
 * slik at en admin kan inspisere dem i admin-UI. Kaster aldri selv.
 */
import { getSupabaseAdmin } from "@/integrations/supabase/admin";
import type { Json } from "@/integrations/supabase/types";
import { describeSafeError, safeErrorContext } from "@/lib/safe-error";

export async function logServerError(
  functionName: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const descriptor = describeSafeError(error);
  const safeFunctionName = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(functionName)
    ? functionName
    : "serverFunction";
  const safeContext = safeErrorContext(context);
  console.error(`[${safeFunctionName}]`, descriptor, safeContext);

  try {
    const supabaseAdmin = await getSupabaseAdmin();
    await supabaseAdmin.from("error_log").insert({
      function_name: safeFunctionName,
      error_message: descriptor.type,
      error_code: descriptor.code ?? null,
      context: {
        ...(safeContext ?? {}),
        ...(descriptor.status === undefined ? {} : { status: descriptor.status }),
      } as Json,
    });
  } catch (logError) {
    console.error("[logServerError] failed to write to error_log", describeSafeError(logError));
  }
}
