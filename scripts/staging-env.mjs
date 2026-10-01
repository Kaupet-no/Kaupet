import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const secretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VIPPS_TEST_CLIENT_ID",
  "VIPPS_TEST_CLIENT_SECRET",
  "VIPPS_TEST_SUBSCRIPTION_KEY",
  "VIPPS_TEST_MSN",
  "VIPPS_TEST_WEBHOOK_SECRET",
  "VAPID_PRIVATE_KEY",
  "RESEND_API_KEY",
  "STATENS_VEGVESEN_API_KEY",
  "MISTRAL_API_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "TURNSTILE_SECRET_KEY",
  "RATE_LIMIT_HMAC_SECRET",
  "IMAGE_JOBS_SECRET",
  "PUSH_DISPATCH_SECRET",
  "R2_CLEANUP_SECRET",
];
const publicNames = [
  "R2_ACCOUNT_ID",
  "R2_BILDER_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "R2_VEDLEGG_BUCKET",
  "VITE_R2_PUBLIC_BASE_URL",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_TURNSTILE_SITE_KEY",
  "VITE_VAPID_PUBLIC_KEY",
];

export function stagingEnv(secrets, variables, names = secretNames) {
  const env = {};
  for (const name of publicNames) env[name] = variables.find((v) => v.name === name)?.value;
  for (const name of names) {
    if (!secretNames.includes(name)) throw new Error("Ugyldig staging-secret-navn");
    env[name] = secrets[name];
  }
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || !value || /[\r\n]/.test(value)) {
      throw new Error(`Staging-konfigurasjon mangler eller er ugyldig: ${name}`);
    }
  }
  if (
    env.VITE_SUPABASE_URL !== "https://zpazmwzhvylptptygzlw.supabase.co" ||
    env.VITE_SUPABASE_PROJECT_ID !== "zpazmwzhvylptptygzlw" ||
    env.R2_BILDER_BUCKET !== "kaupet-bilder-staging" ||
    env.R2_VEDLEGG_BUCKET !== "kaupet-vedlegg-staging"
  ) {
    throw new Error("Staging-konfigurasjonen peker mot feil miljø");
  }
  const claims = JSON.parse(Buffer.from(env.SUPABASE_SERVICE_ROLE_KEY.split(".")[1], "base64url"));
  if (claims.ref !== "zpazmwzhvylptptygzlw" || claims.role !== "service_role") {
    throw new Error("Supabase-nøkkelen tilhører ikke staging service-role");
  }
  return {
    ...env,
    SUPABASE_URL: env.VITE_SUPABASE_URL,
    SUPABASE_PROJECT_ID: env.VITE_SUPABASE_PROJECT_ID,
    SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_ENVIRONMENT: "staging",
    VIPPS_ENVIRONMENT: "test",
    PUBLIC_SITE_URL: "https://staging.kaupet.no",
    TURNSTILE_ALLOWED_HOSTNAMES: "staging.kaupet.no,localhost,127.0.0.1",
    VAPID_SUBJECT: "mailto:kontakt@kaupet.no",
    RESEND_FROM_EMAIL: "Kaupet.no <ikkesvar@varsel.kaupet.no>",
  };
}

export function loadStagingEnv(names) {
  try {
    const secrets = JSON.parse(
      execFileSync(
        "doppler",
        [
          "secrets",
          "download",
          "--no-file",
          "--no-fallback",
          "--format",
          "json",
          "--project",
          "kaupet",
          "--config",
          "stg",
          "--no-read-env",
          "--no-check-version",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    const variables = JSON.parse(
      execFileSync(
        "gh",
        [
          "variable",
          "list",
          "--repo",
          "Kaupet-no/Kaupet",
          "--env",
          "staging",
          "--json",
          "name,value",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    return stagingEnv(secrets, variables, names);
  } catch {
    throw new Error(
      "Kunne ikke hente staging-konfigurasjon. Kontroller Doppler CLI (kaupet/stg) og GitHub CLI-innlogging.",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = loadStagingEnv();
    if (existsSync(".env")) chmodSync(".env", 0o600);
    writeFileSync(
      ".env",
      Object.entries(env)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    console.log(".env oppdatert fra Doppler og offentlige GitHub staging-variabler.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
