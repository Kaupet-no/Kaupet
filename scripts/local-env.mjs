#!/usr/bin/env node
// Genererer .env for lokal utvikling mot den lokale Supabase Docker-stacken.
//
// Krever IKKE tilgang til secrets/dev.env eller noen ekte API-nøkler.
// Ikke-Supabase-variabler (Vipps, Resend, VAPID, ...) hentes som tomme
// placeholders fra .env.example — funksjonalitet som er avhengig av dem
// vil ikke virke før man evt. fyller inn egne/ekte verdier manuelt.
// SUPABASE_*/VITE_SUPABASE_*-verdiene hentes fra `supabase status` og er
// trygge, offentlig kjente lokale dev-defaults (ikke ekte hemmeligheter).

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseDotenv(text) {
  const env = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env.set(key, value);
  }
  return env;
}

function run(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" });
}

const exampleEnv = parseDotenv(readFileSync(path.join(root, ".env.example"), "utf8"));

let statusOutput;
try {
  statusOutput = run("bunx supabase status -o env");
} catch {
  console.error("Fant ikke en kjørende lokal Supabase-stack. Kjør `bunx supabase start` først.");
  process.exit(1);
}
const local = parseDotenv(statusOutput);

const configToml = readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const projectIdMatch = configToml.match(/^project_id\s*=\s*"([^"]+)"/m);
const localProjectId = projectIdMatch?.[1] ?? "local";

const required = ["API_URL", "PUBLISHABLE_KEY", "SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !local.get(key));
if (missing.length > 0) {
  console.error(`\`supabase status -o env\` mangler forventede felt: ${missing.join(", ")}`);
  process.exit(1);
}

const merged = new Map(exampleEnv);
merged.set("SUPABASE_PROJECT_ID", localProjectId);
merged.set("SUPABASE_URL", local.get("API_URL"));
merged.set("SUPABASE_PUBLISHABLE_KEY", local.get("PUBLISHABLE_KEY"));
merged.set("SUPABASE_SERVICE_ROLE_KEY", local.get("SERVICE_ROLE_KEY"));
merged.set("VITE_SUPABASE_PROJECT_ID", localProjectId);
merged.set("VITE_SUPABASE_URL", local.get("API_URL"));
merged.set("VITE_SUPABASE_PUBLISHABLE_KEY", local.get("PUBLISHABLE_KEY"));

const header = [
  "# Generert av `bun run env:local` — IKKE rediger manuelt.",
  "# SUPABASE_*/VITE_SUPABASE_*-verdiene peker mot den lokale Docker-stacken",
  "# (`supabase start`) og er lokale dev-defaults, ikke ekte hemmeligheter.",
  "# Øvrige variabler (Vipps/Resend/VAPID osv.) er tomme placeholders — fyll",
  "# inn egne verdier manuelt om du trenger den funksjonaliteten lokalt.",
  "",
].join("\n");

const body = [...merged.entries()].map(([key, value]) => `${key}=${value}`).join("\n");

writeFileSync(path.join(root, ".env"), `${header}${body}\n`);
console.log(".env skrevet — peker mot lokal Supabase-stack (" + local.get("API_URL") + ")");
