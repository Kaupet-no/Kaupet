import assert from "node:assert/strict";
import { test } from "node:test";
import { stagingEnv } from "./staging-env.mjs";

const ref = "zpazmwzhvylptptygzlw";
const token = (project = ref) =>
  `header.${Buffer.from(JSON.stringify({ ref: project, role: "service_role" })).toString("base64url")}.signature`;
const values = {
  R2_ACCOUNT_ID: "account",
  R2_BILDER_BUCKET: "kaupet-bilder-staging",
  R2_VEDLEGG_BUCKET: "kaupet-vedlegg-staging",
  R2_PUBLIC_BASE_URL: "https://bilder.staging.kaupet.no",
  VITE_R2_PUBLIC_BASE_URL: "https://bilder.staging.kaupet.no",
  VITE_SUPABASE_PROJECT_ID: ref,
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: "public",
  VITE_TURNSTILE_SITE_KEY: "sitekey",
  VITE_VAPID_PUBLIC_KEY: "public-vapid",
};
const variables = Object.entries(values).map(([name, value]) => ({ name, value }));
const secret = {
  SUPABASE_SERVICE_ROLE_KEY: token(),
  CLOUDFLARE_API_TOKEN: "excluded",
  SUPABASE_ACCESS_TOKEN: "excluded",
};
test("databaseimport får staging-role og offentlige vars, aldri management-tokens", () => {
  const env = stagingEnv(secret, variables, ["SUPABASE_SERVICE_ROLE_KEY"]);
  assert.equal(env.SUPABASE_URL, values.VITE_SUPABASE_URL);
  assert.equal(env.VIPPS_ENVIRONMENT, "test");
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.SUPABASE_ACCESS_TOKEN, undefined);
});
test("avviser manglende og ugyldige secrets og konfigurasjon for andre miljøer", () => {
  for (const value of [undefined, null, "", 42, "secret\nbreak", token("production")]) {
    assert.throws(() =>
      stagingEnv({ SUPABASE_SERVICE_ROLE_KEY: value }, variables, ["SUPABASE_SERVICE_ROLE_KEY"]),
    );
  }
  for (const name of [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PROJECT_ID",
    "R2_BILDER_BUCKET",
    "R2_VEDLEGG_BUCKET",
  ]) {
    assert.throws(() =>
      stagingEnv(
        secret,
        variables.map((v) => (v.name === name ? { ...v, value: "production" } : v)),
        ["SUPABASE_SERVICE_ROLE_KEY"],
      ),
    );
  }
  assert.throws(() => stagingEnv(secret, variables, ["CLOUDFLARE_API_TOKEN"]));
  assert.throws(() => stagingEnv(secret, variables));
});
