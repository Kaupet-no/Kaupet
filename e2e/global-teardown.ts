import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json");

export default async function globalTeardown() {
  if (!existsSync(AUTH_FILE)) return;
  const { userId } = JSON.parse(readFileSync(AUTH_FILE, "utf-8")) as { userId: string };

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceRoleKey) {
    const admin = createClient(url, serviceRoleKey);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }

  rmSync(path.dirname(AUTH_FILE), { recursive: true, force: true });
}
