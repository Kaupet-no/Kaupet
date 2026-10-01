#!/usr/bin/env bash
set -euo pipefail
OLD_IMAGE_JOBS_SECRET="${OLD_IMAGE_JOBS_SECRET:-}"
: "${DOPPLER_TOKEN:?DOPPLER_TOKEN mangler i staging}"
case "$OPERATION" in
  sync)
    : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID mangler i staging}"
    ;;
  verify|bootstrap) ;;
  *) echo 'Ugyldig operasjon' >&2; exit 1 ;;
esac
umask 077
response=$(mktemp)
payload=$(mktemp)
trap 'rm -f "$response" "$payload"' EXIT

secret_names='CLOUDFLARE_API_TOKEN,SUPABASE_ACCESS_TOKEN,RESEND_API_KEY,TURNSTILE_SECRET_KEY,MISTRAL_API_KEY,IMAGE_JOBS_SECRET,PUSH_DISPATCH_SECRET,PUSH_DISPATCH_SECRET_PREVIOUS,SUPABASE_SERVICE_ROLE_KEY,R2_CLEANUP_SECRET,RATE_LIMIT_HMAC_SECRET,VAPID_PRIVATE_KEY,VIPPS_TEST_CLIENT_ID,VIPPS_TEST_CLIENT_SECRET,VIPPS_TEST_SUBSCRIPTION_KEY,VIPPS_TEST_MSN,VIPPS_TEST_WEBHOOK_SECRET,STATENS_VEGVESEN_API_KEY'
if [ "$OPERATION" = bootstrap ]; then secret_names='CLOUDFLARE_API_TOKEN'; fi

curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $DOPPLER_TOKEN" \
  --get 'https://api.doppler.com/v3/configs/config/secrets/download' \
  --data-urlencode 'project=kaupet' \
  --data-urlencode 'config=stg' \
  --data-urlencode 'format=json' \
  --data-urlencode "secrets=$secret_names" \
  --output "$response"

if [ "$OPERATION" != verify ]; then
  CLOUDFLARE_API_TOKEN=$(jq -er '.CLOUDFLARE_API_TOKEN | select(type == "string" and length > 0) | select(test("[\\r\\n]") | not)' "$response")
  echo "::add-mask::$CLOUDFLARE_API_TOKEN"
  export CLOUDFLARE_API_TOKEN
fi
if [ "$OPERATION" = bootstrap ]; then
  printf 'CLOUDFLARE_API_TOKEN=%s\n' "$CLOUDFLARE_API_TOKEN" >> "${GITHUB_ENV:?GITHUB_ENV mangler}"
  exit 0
fi
SUPABASE_ACCESS_TOKEN=$(jq -er '.SUPABASE_ACCESS_TOKEN | select(type == "string" and length > 0) | select(test("[\\r\\n]") | not)' "$response")
echo "::add-mask::$SUPABASE_ACCESS_TOKEN"

SUPABASE_SERVICE_ROLE_KEY=$(jq -er '
  .SUPABASE_SERVICE_ROLE_KEY | select(type == "string") |
  select(length > 0 and (test("[\\r\\n]") | not))
' "$response")
echo "::add-mask::$SUPABASE_SERVICE_ROLE_KEY"

jq -e '
  {VIPPS_TEST_CLIENT_ID, VIPPS_TEST_CLIENT_SECRET, VIPPS_TEST_SUBSCRIPTION_KEY, VIPPS_TEST_MSN, VIPPS_TEST_WEBHOOK_SECRET, STATENS_VEGVESEN_API_KEY, RESEND_API_KEY, TURNSTILE_SECRET_KEY, MISTRAL_API_KEY, IMAGE_JOBS_SECRET, PUSH_DISPATCH_SECRET, R2_CLEANUP_SECRET, RATE_LIMIT_HMAC_SECRET, VAPID_PRIVATE_KEY, SUPABASE_SERVICE_ROLE_KEY} |
  select(all(.[]; type == "string")) |
  select(all(.[]; length > 0 and (test("[\\r\\n]") | not)))
' "$response" > "$payload"
while IFS= read -r secret; do
  echo "::add-mask::$secret"
done < <(jq -r '.[]' "$payload")

previous_push=$(jq -er '
  (.PUSH_DISPATCH_SECRET_PREVIOUS // "") | select(type == "string") |
  select(test("[\\r\\n]") | not)
' "$response")
if [ -n "$previous_push" ]; then
  echo "::add-mask::$previous_push"
fi

supabase_url='https://zpazmwzhvylptptygzlw.supabase.co'
image_jobs_url='https://staging.kaupet.no/api/public/images/process'
curl --fail --silent --show-error --max-time 30 \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$supabase_url/rest/v1/app_settings?key=eq.image_jobs_url&select=value" \
  --output "$response"
jq -e --arg url "$image_jobs_url" \
  'length == 1 and .[0].value == $url' "$response" > /dev/null

push_url='https://staging.kaupet.no/api/public/push/dispatch'
curl --fail --silent --show-error --max-time 30 \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$supabase_url/rest/v1/app_settings?key=eq.push_dispatch_url&select=value" \
  --output "$response"
jq -e --arg url "$push_url" \
  'length == 1 and .[0].value == $url' "$response" > /dev/null

cleanup_url='https://staging.kaupet.no/api/public/r2/cleanup'
curl --fail --silent --show-error --max-time 30 \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$supabase_url/rest/v1/app_settings?key=eq.r2_cleanup_url&select=value" \
  --output "$response"
jq -e --arg url "$cleanup_url" \
  'length == 1 and .[0].value == $url' "$response" > /dev/null

: "${VITE_VAPID_PUBLIC_KEY:?Staging VAPID public key mangler}"
jq -r '.VAPID_PRIVATE_KEY' "$payload" | node -e '
  const crypto = require("node:crypto");
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    try {
      const key = crypto.createECDH("prime256v1");
      key.setPrivateKey(Buffer.from(input.trim(), "base64url"));
      if (key.getPublicKey().toString("base64url") !== process.env.VITE_VAPID_PUBLIC_KEY) throw new Error();
    } catch {
      process.stderr.write("Staging VAPID key pair matcher ikke\n");
      process.exitCode = 1;
    }
  });
'

auth_url='https://api.supabase.com/v1/projects/zpazmwzhvylptptygzlw/config/auth'
curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$auth_url" --output "$response"
jq -e '.smtp_host == "smtp.resend.com" and .smtp_user == "resend" and .smtp_admin_email == "ikkesvar@varsel.kaupet.no" and .security_captcha_provider == "turnstile"' "$response" > /dev/null
captcha_enabled=$(jq -er '.security_captcha_enabled | tostring | select(. == "true" or . == "false")' "$response")

if [ "$OPERATION" = sync ]; then
  jq '{smtp_pass: .RESEND_API_KEY, security_captcha_secret: .TURNSTILE_SECRET_KEY}' "$payload" > "$response"
  curl --fail --silent --show-error --max-time 30 \
    --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    --header 'Content-Type: application/json' --request PATCH --data-binary "@$response" \
    "$auth_url" --output /dev/null
  # Staging bruker delte Vipps test-credentials, aldri betalingsmiljøet i produksjon.
  jq '. + {VIPPS_ENVIRONMENT: "test"}' "$payload" > "$response"
  bunx wrangler secret bulk "$response" --name kaupet-no-staging
  echo 'Worker: administrerte staging-hemmeligheter er oppdatert.' >> "$GITHUB_STEP_SUMMARY"

  for setting in image_jobs_secret push_dispatch_secret r2_cleanup_secret; do
    jq --arg key "$setting" '{key: $key, value: .[$key | ascii_upcase]}' "$payload" > "$response"
    curl --fail --silent --show-error --max-time 30 \
      --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      --header 'Content-Type: application/json' \
      --header 'Prefer: resolution=merge-duplicates,return=minimal' \
      --request POST --data-binary "@$response" \
      "$supabase_url/rest/v1/app_settings?on_conflict=key" --output /dev/null
    echo "Supabase: $setting er oppdatert." >> "$GITHUB_STEP_SUMMARY"
  done

fi

echo 'Kontrollerer Supabase-raden …'
curl --fail --silent --show-error --max-time 30 \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$supabase_url/rest/v1/app_settings?key=eq.image_jobs_secret&select=value" \
  --output "$response"
jq -e --slurpfile expected "$payload" \
  'length == 1 and .[0].value == $expected[0].IMAGE_JOBS_SECRET' \
  "$response" > /dev/null
if [ "$OPERATION" = verify ]; then
  rejected_secret="$OLD_IMAGE_JOBS_SECRET"
  if [ -z "$rejected_secret" ]; then
    rejected_secret="invalid-$(openssl rand -hex 32)"
  fi
  jq -e --arg rejected "$rejected_secret" \
    '.IMAGE_JOBS_SECRET != $rejected' "$payload" > /dev/null
  old_status=$(curl --silent --show-error --max-time 30 \
    --request POST --write-out '%{http_code}' \
    --header "x-image-jobs-secret: $rejected_secret" \
    "$image_jobs_url" --output "$response")
  if [ "$old_status" != 401 ]; then
    echo "Negativ autentiseringstest: forventet 401, fikk $old_status" >&2
    exit 1
  fi
  echo 'Verifisert uten synk: gammel GitHub-verdi eller tilfeldig ugyldig verdi avvises med 401.' >> "$GITHUB_STEP_SUMMARY"
fi
echo 'Tester bildejobb-endepunktet …'
curl --fail --silent --show-error --max-time 120 \
  --request POST \
  --header "x-image-jobs-secret: $(jq -r '.IMAGE_JOBS_SECRET' "$payload")" \
  "$image_jobs_url" --output "$response"
jq -e 'has("claimed") and (.claimed | type == "number")' "$response" > /dev/null
echo 'Verifisert: Supabase-verdien matcher og bildejobb-endepunktet svarer med JSON.' >> "$GITHUB_STEP_SUMMARY"

curl --fail --silent --show-error --max-time 30 \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$supabase_url/rest/v1/app_settings?key=eq.push_dispatch_secret&select=value" \
  --output "$response"
jq -e --slurpfile expected "$payload" \
  'length == 1 and .[0].value == $expected[0].PUSH_DISPATCH_SECRET' \
  "$response" > /dev/null
rejected_push="${previous_push:-invalid-$(openssl rand -hex 32)}"
jq -e --arg rejected "$rejected_push" \
  '.PUSH_DISPATCH_SECRET != $rejected' "$payload" > /dev/null
for expected_status in 401 400; do
  push_secret="$rejected_push"
  if [ "$expected_status" = 400 ]; then
    push_secret=$(jq -r '.PUSH_DISPATCH_SECRET' "$payload")
  fi
  push_status=$(curl --silent --show-error --max-time 30 \
    --request POST --write-out '%{http_code}' \
    --header "x-push-dispatch-secret: $push_secret" \
    --header 'Content-Type: application/json' \
    --header 'Origin: https://staging.kaupet.no' \
    --data '{}' "$push_url" --output "$response")
  if [ "$push_status" != "$expected_status" ]; then
    echo "Push-kontroll: forventet $expected_status, fikk $push_status" >&2
    exit 1
  fi
done
echo 'Push kontrollert: Supabase matcher, gammel/ugyldig verdi avvises, ny verdi når payloadvalidering. Ingen varsler sendes.' >> "$GITHUB_STEP_SUMMARY"

curl --fail --silent --show-error --max-time 30 \
  --header "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --header "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$supabase_url/rest/v1/app_settings?key=eq.r2_cleanup_secret&select=value" \
  --output "$response"
jq -e --slurpfile expected "$payload" \
  'length == 1 and .[0].value == $expected[0].R2_CLEANUP_SECRET' \
  "$response" > /dev/null
rejected_cleanup="invalid-$(openssl rand -hex 32)"
jq -e --arg rejected "$rejected_cleanup" \
  '.R2_CLEANUP_SECRET != $rejected' "$payload" > /dev/null
cleanup_status=$(curl --silent --show-error --max-time 30 \
  --request POST --write-out '%{http_code}' \
  --header "x-r2-cleanup-secret: $rejected_cleanup" \
  "$cleanup_url" --output "$response")
if [ "$cleanup_status" != 401 ]; then
  echo "R2 negativ kontroll: forventet 401, fikk $cleanup_status" >&2
  exit 1
fi
echo 'R2 kontrollert: Supabase matcher og ugyldig verdi gir 401. Positivt oppryddingskall er ikke kjørt.' >> "$GITHUB_STEP_SUMMARY"

curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$auth_url" --output "$response"
jq -e --slurpfile expected "$payload" --arg enabled "$captcha_enabled" '
  def matches_or_hidden($secret):
    . == $secret or (type == "string" and test("^[a-f0-9]{64}$"));
  (.smtp_pass | matches_or_hidden($expected[0].RESEND_API_KEY)) and
  (.security_captcha_secret | matches_or_hidden($expected[0].TURNSTILE_SECRET_KEY)) and
  (.security_captcha_enabled | tostring) == $enabled
' "$response" > /dev/null
echo 'Supabase Auth: PATCH akseptert ved synk og konfigurasjon kontrollert. API kan skjule hemmeligheter som 64 hex; direkte samsvar kan da ikke bekreftes.' >> "$GITHUB_STEP_SUMMARY"
