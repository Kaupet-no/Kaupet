#!/usr/bin/env bash
set -euo pipefail
: "${DOPPLER_TOKEN:?DOPPLER_TOKEN mangler i production}"
case "${OPERATION:-}" in
  bootstrap|sync|verify) ;;
  *) echo 'Ugyldig operasjon' >&2; exit 1 ;;
esac
umask 077
response=$(mktemp)
payload=$(mktemp)
auth_before=$(mktemp)
trap 'rm -f "$response" "$payload" "$auth_before"' EXIT

# Explicit runtime allowlist keeps management and native signing keys off the Worker.
runtime_names='SUPABASE_SERVICE_ROLE_KEY,VIPPS_CLIENT_ID,VIPPS_CLIENT_SECRET,VIPPS_SUBSCRIPTION_KEY,VIPPS_MSN,VIPPS_WEBHOOK_SECRET,VIPPS_TEST_CLIENT_ID,VIPPS_TEST_CLIENT_SECRET,VIPPS_TEST_SUBSCRIPTION_KEY,VIPPS_TEST_MSN,VIPPS_TEST_WEBHOOK_SECRET,VAPID_PRIVATE_KEY,FCM_SERVICE_ACCOUNT_JSON,RESEND_API_KEY,STATENS_VEGVESEN_API_KEY,MISTRAL_API_KEY,HF_TOKEN,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,TURNSTILE_SECRET_KEY,RATE_LIMIT_HMAC_SECRET,IMAGE_JOBS_SECRET,PUSH_DISPATCH_SECRET,R2_CLEANUP_SECRET'
curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $DOPPLER_TOKEN" \
  --get 'https://api.doppler.com/v3/configs/config/secrets/download' \
  --data-urlencode 'project=kaupet' --data-urlencode 'config=prd' \
  --data-urlencode 'format=json' \
  --data-urlencode "secrets=$runtime_names,CLOUDFLARE_API_TOKEN,SUPABASE_ACCESS_TOKEN,API_KEY_EXPIRY_SECRET" \
  --output "$response"
jq -e --arg names "$runtime_names" '
  . as $all | $names | split(",") | map(. as $key | {key: $key, value: $all[$key]}) | from_entries |
  select(all(.[]; type == "string" and length > 0))
' "$response" > "$payload"
# FCM contains JSON; all other runtime values must be single-line.
jq -e 'all(to_entries[]; .key == "FCM_SERVICE_ACCOUNT_JSON" or (.value | test("[\\r\\n]") | not))' "$payload" > /dev/null
jq -er '.FCM_SERVICE_ACCOUNT_JSON | fromjson | select(.type == "service_account" and (.private_key | type == "string" and length > 0) and (.client_email | type == "string" and length > 0))' "$payload" > /dev/null 2>&1 || { echo 'Ugyldig FCM service account' >&2; exit 1; }
if jq -e 'has("API_KEY_EXPIRY_SECRET")' "$response" > /dev/null; then
  jq -e '.API_KEY_EXPIRY_SECRET | select(type == "string" and length > 0 and (test("[\\r\\n]") | not))' "$response" > /dev/null
  jq --slurpfile source "$response" '. + {API_KEY_EXPIRY_SECRET: $source[0].API_KEY_EXPIRY_SECRET}' "$payload" > "$auth_before"
  cp "$auth_before" "$payload"
fi
CLOUDFLARE_API_TOKEN=$(jq -er '.CLOUDFLARE_API_TOKEN | select(type == "string" and length > 0 and (test("[\\r\\n]") | not))' "$response")
SUPABASE_ACCESS_TOKEN=$(jq -er '.SUPABASE_ACCESS_TOKEN | select(type == "string" and length > 0 and (test("[\\r\\n]") | not))' "$response")
SUPABASE_SERVICE_ROLE_KEY=$(jq -r '.SUPABASE_SERVICE_ROLE_KEY' "$payload")
export CLOUDFLARE_API_TOKEN
for secret in "$CLOUDFLARE_API_TOKEN" "$SUPABASE_ACCESS_TOKEN"; do echo "::add-mask::$secret"; done
while IFS= read -r secret; do echo "::add-mask::$secret"; done < <(jq -r '.[] | split("\n")[] | select(length > 0)' "$payload")

supabase_url='https://efuexbrxdvjznrvoqbsd.supabase.co'
auth_url='https://api.supabase.com/v1/projects/efuexbrxdvjznrvoqbsd/config/auth'
curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$auth_url" --output "$auth_before"
jq -e '.smtp_host == "smtp.resend.com" and .smtp_user == "resend" and .security_captcha_provider == "turnstile"' "$auth_before" > /dev/null
for setting in image_jobs push_dispatch r2_cleanup api_key_expiry; do
  if [ "$setting" = api_key_expiry ] && ! jq -e 'has("API_KEY_EXPIRY_SECRET")' "$payload" > /dev/null; then continue; fi
  path="$setting"
  case "$setting" in
    image_jobs) path=images/process ;;
    push_dispatch) path=push/dispatch ;;
    r2_cleanup) path=r2/cleanup ;;
    api_key_expiry) path=api-keys/expiry-notify ;;
  esac
  curl --fail --silent --show-error --max-time 30 \
    --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$supabase_url/rest/v1/app_settings?key=eq.${setting}_url&select=value" --output "$response"
  jq -e --arg url "https://kaupet.no/api/public/$path" 'length == 1 and .[0].value == $url' "$response" > /dev/null
done
: "${VITE_VAPID_PUBLIC_KEY:?Produksjonens offentlige VAPID-nokkel mangler}"
jq -r '.VAPID_PRIVATE_KEY' "$payload" | node -e '
  const crypto = require("node:crypto"); let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    try {
      const key = crypto.createECDH("prime256v1");
      key.setPrivateKey(Buffer.from(input.trim(), "base64url"));
      if (key.getPublicKey().toString("base64url") !== process.env.VITE_VAPID_PUBLIC_KEY) throw new Error();
    } catch { process.stderr.write("Produksjonens VAPID-par matcher ikke\n"); process.exitCode = 1; }
  });
'
if [ "$OPERATION" = bootstrap ]; then
  printf 'CLOUDFLARE_API_TOKEN=%s\n' "$CLOUDFLARE_API_TOKEN" >> "${GITHUB_ENV:?GITHUB_ENV mangler}"
  exit 0
fi
if [ "$OPERATION" = sync ]; then
  : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID mangler}"
  jq '{smtp_pass: .RESEND_API_KEY, security_captcha_secret: .TURNSTILE_SECRET_KEY}' "$payload" > "$response"
  curl --fail --silent --show-error --max-time 30 \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" --header 'Content-Type: application/json' \
    --request PATCH --data-binary "@$response" "$auth_url" --output /dev/null
  bunx wrangler secret bulk "$payload" --name kaupet-no
  for setting in image_jobs_secret push_dispatch_secret r2_cleanup_secret api_key_expiry_secret; do
    if ! jq -e --arg key "$setting" 'has($key | ascii_upcase)' "$payload" > /dev/null; then continue; fi
    jq --arg key "$setting" '{key: $key, value: .[$key | ascii_upcase]}' "$payload" > "$response"
    curl --fail --silent --show-error --max-time 30 \
      --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      --header 'Content-Type: application/json' --header 'Prefer: resolution=merge-duplicates,return=minimal' \
      --request POST --data-binary "@$response" "$supabase_url/rest/v1/app_settings?on_conflict=key" --output /dev/null
  done
fi
for setting in image_jobs_secret push_dispatch_secret r2_cleanup_secret api_key_expiry_secret; do
  if ! jq -e --arg key "$setting" 'has($key | ascii_upcase)' "$payload" > /dev/null; then continue; fi
  curl --fail --silent --show-error --max-time 30 \
    --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$supabase_url/rest/v1/app_settings?key=eq.$setting&select=value" --output "$response"
  jq -e --arg key "$setting" --slurpfile expected "$payload" 'length == 1 and .[0].value == $expected[0][$key | ascii_upcase]' "$response" > /dev/null
done
curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$auth_url" --output "$response"
jq -e --slurpfile before "$auth_before" --slurpfile expected "$payload" '
  def matches_or_hidden($secret): . == $secret or (type == "string" and test("^[a-f0-9]{64}$"));
  .security_captcha_enabled == $before[0].security_captcha_enabled and
  .smtp_admin_email == $before[0].smtp_admin_email and
  (.smtp_pass | matches_or_hidden($expected[0].RESEND_API_KEY)) and
  (.security_captcha_secret | matches_or_hidden($expected[0].TURNSTILE_SECRET_KEY))
' "$response" > /dev/null
echo 'Produksjon: Supabase-jobbenes hemmeligheter matcher Doppler. Auth-innstillinger er bevart; skjulte Auth-verdier og Worker-verdier kan ikke leses tilbake.' >> "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY mangler}"
# Production verification is read-only: never dispatch jobs, notifications or payments.
