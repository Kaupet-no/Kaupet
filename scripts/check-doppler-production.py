"""Offline decision-table checks; no network or production jobs are called."""
from pathlib import Path
import json
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
script = (root / 'scripts/doppler-production.sh').read_text()
names = re.search(r"runtime_names='([^']+)'", script)[1].split(',')
pair = json.loads(subprocess.check_output(['node', '-e', 'const c=require("node:crypto");const e=c.createECDH("prime256v1");e.generateKeys();console.log(JSON.stringify({private:e.getPrivateKey().toString("base64url"),public:e.getPublicKey().toString("base64url")}));']))
valid = {key: 'fake-' + key for key in names}
valid.update(CLOUDFLARE_API_TOKEN='fake-cf', SUPABASE_ACCESS_TOKEN='fake-management', VAPID_PRIVATE_KEY=pair['private'], FCM_SERVICE_ACCOUNT_JSON=json.dumps({'type': 'service_account', 'private_key': 'fake', 'client_email': 'fake@example.invalid'}))
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    (temp / 'curl').write_text('''#!/bin/bash
set -eu
url=""; output=""; data=""; method=GET
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift ;;
    --data-binary) data="$2"; shift ;;
    --request) method="$2"; shift ;;
    https://*) url="$1" ;;
  esac
  shift
done
case "$url" in
  https://api.doppler.com/*) cp "$FIXTURE" "$output" ;;
  https://api.supabase.com/v1/projects/efuexbrxdvjznrvoqbsd/config/auth)
    [[ "$AUTH_STATUS" == 200 ]] || exit 22
    if [[ "$method" == PATCH ]]; then echo auth >> "$WRITES"; fi
    [[ "$output" == /dev/null ]] || jq -n --arg smtp "$(jq -r .RESEND_API_KEY "$FIXTURE")" --arg captcha "$(jq -r .TURNSTILE_SECRET_KEY "$FIXTURE")" '{smtp_host:"smtp.resend.com",smtp_user:"resend",security_captcha_provider:"turnstile",security_captcha_enabled:true,smtp_admin_email:"prod@example.invalid",smtp_pass:$smtp,security_captcha_secret:$captcha}' > "$output" ;;
  https://efuexbrxdvjznrvoqbsd.supabase.co/rest/v1/app_settings*)
    if [[ "$method" == POST ]]; then echo database >> "$WRITES"; exit 0; fi
    key="${url#*key=eq.}"; key="${key%%&*}"
    case "$key" in
      image_jobs_url) value="$JOB_URL" ;;
      push_dispatch_url) value=https://kaupet.no/api/public/push/dispatch ;;
      r2_cleanup_url) value=https://kaupet.no/api/public/r2/cleanup ;;
      api_key_expiry_url) value=https://kaupet.no/api/public/api-keys/expiry-notify ;;
      *_secret) value=$(jq -r --arg key "$key" '.[$key | ascii_upcase]' "$FIXTURE") ;;
      *) exit 1 ;;
    esac
    jq -n --arg value "$value" '[{value: $value}]' > "$output" ;;
  *) echo 'Unexpected URL or production job call' >&2; exit 1 ;;
esac
''')
    (temp / 'bunx').write_text('''#!/bin/bash
set -eu
[[ "$1 $2 $3" == "wrangler secret bulk" && "$5 $6" == "--name kaupet-no" ]]
jq -e 'has("CLOUDFLARE_API_TOKEN") == false and has("SUPABASE_ACCESS_TOKEN") == false and has("STAGING_SUPABASE_SERVICE_ROLE_KEY") == false' "$4" >/dev/null
echo worker >> "$WRITES"
''')
    for command in ('curl', 'bunx'):
        (temp / command).chmod(0o700)
    env = dict(os.environ, PATH=directory + ':' + os.environ['PATH'], OPERATION='sync',
               DOPPLER_TOKEN='fake', CLOUDFLARE_ACCOUNT_ID='fake', VITE_VAPID_PUBLIC_KEY=pair['public'],
               GITHUB_ENV=str(temp / 'github-env'), GITHUB_STEP_SUMMARY=str(temp / 'summary'),
               FIXTURE=str(temp / 'fixture'), WRITES=str(temp / 'writes'), AUTH_STATUS='200',
               JOB_URL='https://kaupet.no/api/public/images/process')
    cases = [(valid, {}, True, True), (valid, {'OPERATION': 'verify'}, True, False),
             (valid, {'OPERATION': 'bootstrap'}, True, False),
             (valid, {'OPERATION': 'invalid'}, False, False),
             (valid, {'AUTH_STATUS': '403'}, False, False),
             (valid, {'JOB_URL': 'https://staging.kaupet.no/api/public/images/process'}, False, False),
             (valid, {'VITE_VAPID_PUBLIC_KEY': 'wrong'}, False, False),
             (dict(valid, FCM_SERVICE_ACCOUNT_JSON='invalid'), {}, False, False),
             (dict(valid, FCM_SERVICE_ACCOUNT_JSON=json.dumps({'type': 'service_account', 'private_key': 42, 'client_email': 'fake'})), {}, False, False),
             (dict(valid, API_KEY_EXPIRY_SECRET='fake-expiry'), {}, True, True)]
    for key in names + ['SUPABASE_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN']:
        for invalid in (None, '', 42):
            cases.append((dict(valid, **{key: invalid}), {}, False, False))
        if key != 'FCM_SERVICE_ACCOUNT_JSON':
            cases.append((dict(valid, **{key: 'line\nbreak'}), {}, False, False))
    for payload, overrides, success, written in cases:
        (temp / 'fixture').write_text(json.dumps(payload))
        (temp / 'writes').unlink(missing_ok=True)
        result = subprocess.run(['bash', str(root / 'scripts/doppler-production.sh')], env=env | overrides, capture_output=True)
        assert (result.returncode == 0) == success, result.stderr.decode()
        assert (temp / 'writes').exists() == written
    print(f'{len(cases)} Doppler-production checks passed')
