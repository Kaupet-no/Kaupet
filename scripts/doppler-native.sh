#!/usr/bin/env bash
set -euo pipefail
: "${DOPPLER_TOKEN:?DOPPLER_TOKEN mangler i production}"
: "${GITHUB_ENV:?GITHUB_ENV mangler}"
case "${PLATFORM:-}" in
  android-preview) names='ANDROID_GOOGLE_SERVICES_JSON' ;;
  android) names='ANDROID_GOOGLE_SERVICES_JSON,ANDROID_UPLOAD_KEYSTORE_BASE64,ANDROID_UPLOAD_KEYSTORE_PASSWORD,ANDROID_UPLOAD_KEY_ALIAS,ANDROID_UPLOAD_KEY_PASSWORD,PLAY_SERVICE_ACCOUNT_JSON' ;;
  ios) names='IOS_GOOGLE_SERVICE_INFO_PLIST,APP_STORE_CONNECT_KEY_ID,APP_STORE_CONNECT_ISSUER_ID,APP_STORE_CONNECT_KEY_P8,APPLE_TEAM_ID' ;;
  *) echo 'Ugyldig native-plattform' >&2; exit 1 ;;
esac
umask 077
response=$(mktemp)
trap 'rm -f "$response"' EXIT
curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $DOPPLER_TOKEN" \
  --get 'https://api.doppler.com/v3/configs/config/secrets/download' \
  --data-urlencode 'project=kaupet' --data-urlencode 'config=prd' \
  --data-urlencode 'format=json' --data-urlencode "secrets=$names" --output "$response"
jq -e 'type == "object" and all(.[]; type == "string")' "$response" > /dev/null
IFS=',' read -r -a keys <<< "$names"
for key in "${keys[@]}"; do
  if ! jq -e --arg key "$key" 'has($key) and (.[$key] | length > 0)' "$response" > /dev/null; then continue; fi
  value=$(jq -r --arg key "$key" '.[$key]' "$response")
  while IFS= read -r line; do
    if [ -n "$line" ]; then echo "::add-mask::$line"; fi
  done <<< "$value"
  delimiter="DOPPLER_$(openssl rand -hex 32)"
  printf '%s<<%s\n%s\n%s\n' "$key" "$delimiter" "$value" "$delimiter" >> "$GITHUB_ENV"
done
