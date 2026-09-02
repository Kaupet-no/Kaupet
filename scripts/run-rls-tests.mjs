import { execFileSync, spawnSync } from "node:child_process";

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

const inherited = {
  LOCAL_SUPABASE_URL: process.env.LOCAL_SUPABASE_URL,
  LOCAL_SUPABASE_ANON_KEY: process.env.LOCAL_SUPABASE_ANON_KEY,
  LOCAL_SUPABASE_SERVICE_ROLE_KEY: process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY,
};

let localEnv = inherited;
if (!Object.values(inherited).every(Boolean)) {
  let status;
  try {
    status = parseEnv(
      execFileSync("bunx", ["supabase", "status", "-o", "env"], { encoding: "utf8" }),
    );
  } catch {
    console.error("RLS-testene krever en lokal Supabase-stack. Kjør `bunx supabase start` først.");
    process.exit(1);
  }
  localEnv = {
    LOCAL_SUPABASE_URL: status.API_URL,
    LOCAL_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  };
}

if (!Object.values(localEnv).every(Boolean)) {
  console.error("Supabase status mangler API_URL, PUBLISHABLE_KEY eller SERVICE_ROLE_KEY.");
  process.exit(1);
}

const result = spawnSync(
  "bunx",
  [
    "vitest",
    "run",
    "-c",
    "vitest.integration.config.ts",
    "src/lib/rls.integration.test.ts",
    "src/features/listing-bulk-import/listing-bulk-import.integration.test.ts",
  ],
  { stdio: "inherit", env: { ...process.env, ...localEnv } },
);
process.exit(result.status ?? 1);
