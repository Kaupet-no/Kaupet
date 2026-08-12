#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });
}

function parseDotenv(text) {
  const values = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator);
    let value = trimmed.slice(separator + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function localSupabaseStatus(workdir) {
  const result = run("bunx", ["supabase", "--workdir", workdir, "status", "-o", "env"], {
    capture: true,
  });
  return result.status === 0 ? parseDotenv(result.stdout) : null;
}

const e2eRoot = mkdtempSync(path.join(tmpdir(), "kaupet-e2e-"));
const e2eSupabaseDir = path.join(e2eRoot, "supabase");
cpSync(path.join(root, "supabase"), e2eSupabaseDir, { recursive: true });
const configPath = path.join(e2eSupabaseDir, "config.toml");
const isolatedConfig = readFileSync(configPath, "utf8")
  .replace('project_id = "Kaupet"', 'project_id = "KaupetE2E"')
  .replaceAll("54320", "56320")
  .replaceAll("54321", "56321")
  .replaceAll("54322", "56322")
  .replaceAll("54323", "56323")
  .replaceAll("54324", "56324")
  .replaceAll("54325", "56325")
  .replaceAll("54326", "56326")
  .replaceAll("54327", "56327")
  .replaceAll("54329", "56329")
  .replace("inspector_port = 8083", "inspector_port = 8183")
  .replace("[auth.email.smtp]\nenabled = true", "[auth.email.smtp]\nenabled = false");
writeFileSync(configPath, isolatedConfig);

let supabaseStarted = false;
let exitCode = 1;

try {
  const start = run("bunx", ["supabase", "--workdir", e2eRoot, "start"]);
  if (start.status !== 0) {
    throw new Error(
      "Kunne ikke starte isolert lokal Supabase. Kontroller at Docker kjører, og prøv igjen.",
    );
  }
  supabaseStarted = true;

  const local = localSupabaseStatus(e2eRoot);
  if (!local) throw new Error("Lokal Supabase startet, men status kunne ikke leses.");

  const apiUrl = local.get("API_URL");
  const publishableKey = local.get("PUBLISHABLE_KEY") ?? local.get("ANON_KEY");
  const serviceRoleKey = local.get("SERVICE_ROLE_KEY");
  if (!apiUrl || !publishableKey || !serviceRoleKey) {
    throw new Error(
      "Supabase-status mangler API_URL, PUBLISHABLE_KEY/ANON_KEY eller SERVICE_ROLE_KEY.",
    );
  }

  const env = {
    ...process.env,
    SUPABASE_PROJECT_ID: "Kaupet",
    SUPABASE_URL: apiUrl,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    VITE_SUPABASE_PROJECT_ID: "Kaupet",
    VITE_SUPABASE_URL: apiUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_ENVIRONMENT: "development",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    PUBLIC_SITE_URL: "http://localhost:8080",
  };

  const playwright = run("bun", ["run", "test:e2e:playwright", ...process.argv.slice(2)], {
    env,
  });
  exitCode = playwright.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (supabaseStarted) {
    const stop = run("bunx", ["supabase", "--workdir", e2eRoot, "stop", "--no-backup"]);
    if (stop.status !== 0 && exitCode === 0) exitCode = stop.status ?? 1;
  }
  rmSync(e2eRoot, { recursive: true, force: true });
}

process.exit(exitCode);
