import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json");

/**
 * `listings.seller_id` and `profiles.id` are both `REFERENCES
 * auth.users(id) ON DELETE CASCADE`, so deleting the test users here also
 * removes every listing (and other per-user data) the test run created — no
 * separate cleanup query needed. A failure here is logged rather than
 * swallowed: an auth user left behind also leaves its listings behind
 * (staging accumulates test data silently), so it should be visible in CI
 * output even though it doesn't fail the run.
 */
export default async function globalTeardown() {
  if (!existsSync(AUTH_FILE)) return;
  const { userIds, businessOrganizationId } = JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as {
    userIds: string[];
    businessOrganizationId?: string | null;
  };

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let cleanupFailure: Error | null = null;
  if (url && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey);
    const failures = [];
    if (businessOrganizationId) {
      const { error } = await admin.from("organizations").delete().eq("id", businessOrganizationId);
      if (error) failures.push({ userId: `organization:${businessOrganizationId}`, error });
    }
    for (const userId of userIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) failures.push({ userId, error });
    }
    if (failures.length > 0) {
      cleanupFailure = new Error(
        `[e2e global-teardown] Kunne ikke slette ${failures.length} testbruker(e): ` +
          failures
            .map(
              ({ userId, error }) =>
                `${userId}: status=${"status" in error ? error.status : "-"} code=${error.code ?? "-"} message=${error.message}`,
            )
            .join("; "),
      );
    }
  }

  rmSync(path.dirname(AUTH_FILE), { recursive: true, force: true });
  if (cleanupFailure) throw cleanupFailure;
}
