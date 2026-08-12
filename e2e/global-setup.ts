/**
 * Creates a confirmed test user and deterministic listings before the e2e
 * suite runs. `bun run test:e2e` supplies credentials for an isolated local
 * Supabase stack; no shared hosted project or developer `.env` is used.
 *
 * Credentials are written to e2e/.auth/user.json (gitignored) so individual
 * test files don't need their own Supabase admin client.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json");
const FILTER_FIXTURE_QUERY = "e2efilterfixture";
const PUBLISH_PROJECTS = ["desktop-web", "mobile-web"] as const;

export default async function globalSetup() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "e2e tests need local SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "Run them through `bun run test:e2e`.",
    );
  }

  const admin = createClient(url, serviceRoleKey);
  const runId = Date.now();
  const password = "e2e-test-password-12345";
  const userIds: string[] = [];

  async function createTestUser(suffix: string, displayName: string, needsDemoRole = false) {
    const email = `e2e-${runId}-${suffix}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw error;

    const userId = data.user!.id;
    userIds.push(userId);
    if (needsDemoRole) {
      const { error: roleError } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "demo" });
      if (roleError) throw roleError;
    }

    return { email, password, userId };
  }

  try {
    // Search fixtures must not count against the hourly listing quota of the
    // users that exercise publishing. Each Playwright project gets a separate
    // publisher as well, so running desktop before mobile cannot exhaust the
    // second project's quota.
    const fixtureOwner = await createTestUser("fixtures", "E2E Fixture Owner");
    const users: Record<string, { email: string; password: string; userId: string }> = {};
    for (const project of PUBLISH_PROJECTS) {
      users[project] = await createTestUser(project, `E2E Test ${project}`, true);
    }

    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id")
      .eq("slug", "e2e-test-listing")
      .single();
    if (categoryError) throw categoryError;

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);
    const { error: fixtureError } = await admin.from("listings").insert([
      {
        seller_id: fixtureOwner.userId,
        category_id: category.id,
        title: `${FILTER_FIXTURE_QUERY} gratis`,
        description: "Deterministisk E2E-filterfixture.",
        is_free: true,
        price_nok: null,
        condition: "new",
        status: "active",
        published_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      {
        seller_id: fixtureOwner.userId,
        category_id: category.id,
        title: `${FILTER_FIXTURE_QUERY} rimelig`,
        description: "Deterministisk E2E-filterfixture.",
        is_free: false,
        price_nok: 100,
        condition: "good",
        status: "active",
        published_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      {
        seller_id: fixtureOwner.userId,
        category_id: category.id,
        title: `${FILTER_FIXTURE_QUERY} dyrere`,
        description: "Deterministisk E2E-filterfixture.",
        is_free: false,
        price_nok: 200,
        condition: "new",
        status: "active",
        published_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
    ]);
    if (fixtureError) throw fixtureError;

    mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    writeFileSync(
      AUTH_FILE,
      JSON.stringify({
        users,
        userIds,
        filterFixture: { query: FILTER_FIXTURE_QUERY, total: 3, paid: 2 },
      }),
    );
  } catch (setupError) {
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
    throw setupError;
  }
}
