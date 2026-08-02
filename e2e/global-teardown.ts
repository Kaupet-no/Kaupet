import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json");

/**
 * `listings.seller_id` and `profiles.id` are both `REFERENCES
 * auth.users(id) ON DELETE CASCADE`, so deleting the test user here also
 * removes every listing (and other per-user data) the test run created — no
 * separate cleanup query needed. A failure here is logged rather than
 * swallowed: an auth user left behind also leaves its listings behind
 * (staging accumulates test data silently), so it should be visible in CI
 * output even though it doesn't fail the run.
 */
export default async function globalTeardown() {
  if (!existsSync(AUTH_FILE)) return;
  const { userId } = JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as { userId: string };

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(
        `[e2e global-teardown] Kunne ikke slette testbruker ${userId} (og dermed heller ikke ` +
          `annonsene den opprettet): ${error.message}`,
      );
    }
  }

  rmSync(path.dirname(AUTH_FILE), { recursive: true, force: true });
}
