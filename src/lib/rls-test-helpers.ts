/**
 * Shared helpers for the RLS integration tests in src/lib/rls/*.integration.test.ts
 * (see docs/TESTSTRATEGI.md PB-4). Not a test file itself. Requires a local
 * Supabase stack; `bun run test:rls` reads URL/keys from `supabase status`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll } from "vitest";

export const URL = process.env.LOCAL_SUPABASE_URL;
export const ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
export const SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
export const canRun = Boolean(URL && ANON_KEY && SERVICE_ROLE_KEY);
export const PASSWORD = "test-password-12345";

// Categories created by createTestCategory() across all describe blocks below,
// deleted once in the module-level afterAll registered by
// registerCategoryCleanup(), which each test file calls at the bottom of the
// file. A block-local afterAll runs first (vitest runs afterAll hooks in the
// reverse order they were registered, and block-local ones register before
// this module-level one), so any child rows (word stats, etc.) a block cleans
// up itself are already gone by the time we delete the category here.
// Vitest isolates modules per test file, so each file gets its own list.
const testCategoryIds: string[] = [];

export async function createTestCategory(admin: SupabaseClient, suffix: number | string) {
  const { data, error } = await admin
    .from("categories")
    .insert({ slug: `rls-category-${suffix}`, name_nb: "RLS testkategori" })
    .select("id")
    .single();
  if (error) throw error;
  testCategoryIds.push(data.id);
  return data.id;
}

export async function createRlsUser(admin: SupabaseClient, email: string, userIds: string[]) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user!.id);
  return data.user!.id;
}

/** With ~14 test groups each signing in 2-4 users, a full run does 60+
 * password sign-ins in well under a minute — enough to trip Supabase auth's
 * per-project rate limit on staging. Retries with backoff on a rate-limit
 * response instead of failing the whole suite. */
export async function signInWithRetry(email: string, attempt = 0): Promise<SupabaseClient> {
  const client = createClient(URL!, ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (!error) return client;
  const isRateLimited = error.status === 429 || /rate limit/i.test(error.message);
  if (isRateLimited && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return signInWithRetry(email, attempt + 1);
  }
  throw error;
}

export async function grantAdmin(admin: SupabaseClient, userId: string) {
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role: "admin" });
  if (error) throw error;
}

// Shared cleanup for every createTestCategory() call in the importing file, so
// each call site doesn't need its own category teardown. Call once at the
// bottom of each test file: it then runs after all block-local afterAll hooks
// (see comment at testCategoryIds above), so any child rows those blocks own
// (word stats, etc.) are gone first.
export function registerCategoryCleanup() {
  afterAll(async () => {
    if (!canRun || testCategoryIds.length === 0) return;
    const admin = createClient(URL!, SERVICE_ROLE_KEY!);
    const { error } = await admin.from("categories").delete().in("id", testCategoryIds);
    if (error) throw error;
  });
}
