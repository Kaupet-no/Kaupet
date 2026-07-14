/**
 * Logger feil fra server-funksjoner til konsoll og til `error_log`-tabellen,
 * slik at en admin kan inspisere dem i admin-UI. Kaster aldri selv.
 */
import type { Json } from "@/integrations/supabase/types";

export async function logServerError(
  functionName: string,
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;

  console.error(`[${functionName}]`, { error: message, context });

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("error_log").insert({
      function_name: functionName,
      error_message: message,
      error_code: code ?? null,
      context: context ? (JSON.parse(JSON.stringify(context)) as Json) : null,
    });
  } catch (logError) {
    console.error("[logServerError] failed to write to error_log", logError);
  }
}
