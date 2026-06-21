/**
 * Creates a confirmed test user before the e2e suite runs, using the same
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY the app's own server code reads
 * (see src/lib/env.server.ts) — so e2e tests run against whatever Supabase
 * project your local `.env` already points at.
 *
 * Credentials are written to e2e/.auth/user.json (gitignored) so individual
 * test files don't need their own Supabase admin client.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

export default async function globalSetup() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "e2e tests need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (same as local dev .env) " +
        "to create a confirmed test user. See README.md → Testing.",
    );
  }

  const admin = createClient(url, serviceRoleKey);
  const email = `e2e-${Date.now()}@example.com`;
  const password = "e2e-test-password-12345";

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "E2E Test" },
  });
  if (error) throw error;

  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  writeFileSync(AUTH_FILE, JSON.stringify({ email, password, userId: data.user!.id }));
}
