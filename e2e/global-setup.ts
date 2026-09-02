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
const PUBLISH_PROJECTS = [
  "desktop-web",
  "mobile-web",
  "visual-web",
  "visual-phone",
  "visual-landscape",
  "visual-tablet",
] as const;

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
  let businessOrganizationId: string | null = null;

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
    const desktopUser = users["desktop-web"];
    const { data: businessOrganization, error: businessOrganizationError } = await admin
      .from("organizations")
      .insert({
        organization_number: `9${String(runId).slice(-8)}`,
        legal_name: "E2E Proff AS",
        display_name: "E2E Proff",
        selected_plan: "proff",
        proff_access_until: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (businessOrganizationError) throw businessOrganizationError;
    businessOrganizationId = businessOrganization.id;
    const { error: businessMemberError } = await admin.from("organization_members").insert({
      organization_id: businessOrganization.id,
      user_id: desktopUser.userId,
      role: "superuser",
      status: "active",
    });
    if (businessMemberError) throw businessMemberError;

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
        lat: 59.9139,
        lng: 10.7522,
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
        status: "active",
        condition: "good",
        lat: 59.922,
        lng: 10.73,
        published_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      {
        seller_id: fixtureOwner.userId,
        category_id: category.id,
        title: `${FILTER_FIXTURE_QUERY} dyrere`,
        description: "Deterministisk E2E-filterfixture.",
        status: "active",
        is_free: false,
        price_nok: 200,
        lat: 59.9,
        lng: 10.78,
        published_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
    ]);
    if (fixtureError) throw fixtureError;

    const { data: fixtureRows, error: fixtureSearchError } = await admin.rpc(
      "search_listings_page",
      {
        _include_groups: [{ mode: "all", terms: [FILTER_FIXTURE_QUERY] }],
        _sort: "new",
        _limit: 1,
        _offset: 0,
      },
    );
    if (fixtureSearchError) throw fixtureSearchError;
    if (fixtureRows?.[0]?.total_count !== 3) {
      throw new Error(
        `E2E-filterfixturen ga ${fixtureRows?.[0]?.total_count ?? 0} treff; forventet 3.`,
      );
    }

    mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    writeFileSync(
      AUTH_FILE,
      JSON.stringify({
        users,
        userIds,
        businessOrganizationId,
        filterFixture: { query: FILTER_FIXTURE_QUERY, total: 3, paid: 2 },
      }),
    );
  } catch (setupError) {
    if (businessOrganizationId) {
      await admin.from("organizations").delete().eq("id", businessOrganizationId);
    }
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
    throw setupError;
  }
}
