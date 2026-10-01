"""Offline check: run the workflow shell with fake HTTP and Wrangler commands."""
from pathlib import Path
import json
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
script = (root / 'scripts/doppler-staging.sh').read_text()
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    (temp / 'curl').write_text('''#!/bin/bash
set -eu
url=""; output=""; data=""; write_out=""; push_secret=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --header) [[ "$2" != x-push-dispatch-secret:* ]] || push_secret="${2#x-push-dispatch-secret: }"; shift ;;
    --write-out) write_out="$2"; shift ;;
    --output) output="$2"; shift ;;
    --data-binary) data="$2"; shift ;;
    https://*) url="$1" ;;
  esac
  shift
done
case "$url" in
  https://api.supabase.com/*)
    if [[ -n "$data" ]]; then [[ "$FAIL_AUTH_POST" == 0 ]] || exit 22; cp "${data#@}" "$AUTH_DATABASE"; else
      jq '. + {smtp_pass:(if env.HIDE_AUTH == "1" then ("a" * 64) else .smtp_pass end),security_captcha_secret:(if env.HIDE_AUTH == "1" then ("b" * 64) else .security_captcha_secret end),smtp_host:"smtp.resend.com",smtp_user:"resend",smtp_admin_email:"ikkesvar@varsel.kaupet.no",security_captcha_provider:"turnstile",security_captcha_enabled:false}' "$AUTH_DATABASE" > "$output"
    fi ;;
  https://api.doppler.com/*) cp "$FIXTURE" "$output" ;;
  *key=eq.r2_cleanup_url*) printf '[{"value":"%s"}]' "$CLEANUP_URL" > "$output" ;;
  *key=eq.r2_cleanup_secret*) cp "$CLEANUP_DATABASE" "$output" ;;
  https://staging.kaupet.no/api/public/r2/cleanup) [[ -n "$write_out" ]]; printf '%s' "$CLEANUP_BAD_STATUS" ;;
  *key=eq.push_dispatch_url*) printf '[{"value":"%s"}]' "$PUSH_URL" > "$output" ;;
  *key=eq.push_dispatch_secret*) cp "$PUSH_DATABASE" "$output" ;;
  https://staging.kaupet.no/api/public/push/dispatch)
    if [[ "$push_secret" == fake-push ]]; then printf '%s' "$PUSH_GOOD_STATUS"; else printf '%s' "$PUSH_BAD_STATUS"; fi ;;
  *key=eq.image_jobs_url*) printf '[{"value":"%s"}]' "$JOB_URL" > "$output" ;;
  *on_conflict=key*)
    [[ "$FAIL_POST" == 0 ]] || exit 22
    jq -e '(.key == "image_jobs_secret" or .key == "push_dispatch_secret" or .key == "r2_cleanup_secret") and (.value | type == "string")' "${data#@}" >/dev/null
    destination="$DATABASE"
    if [[ "$(jq -r .key "${data#@}")" == push_dispatch_secret ]]; then
      [[ "$FAIL_PUSH_POST" == 0 ]] || exit 22
      destination="$PUSH_DATABASE"
    fi
    if [[ "$(jq -r .key "${data#@}")" == r2_cleanup_secret ]]; then
      [[ "$FAIL_CLEANUP_POST" == 0 ]] || exit 22
      destination="$CLEANUP_DATABASE"
    fi
    jq '[{value: .value}]'  "${data#@}" > "$destination"
    ;;
  *key=eq.image_jobs_secret*) cp "$DATABASE" "$output" ;;
  https://staging.kaupet.no/api/public/images/process) if [[ -n "$write_out" ]]; then printf '%s' "$OLD_STATUS"; else echo '{"claimed":0}' > "$output"; fi ;;
  *) exit 1 ;;
esac
''')
    (temp / 'bunx').write_text('''#!/bin/bash
set -eu
[[ "$1 $2 $3" == "wrangler secret bulk" && "$5 $6" == "--name kaupet-no-staging" ]]
jq -e 'keys == ["IMAGE_JOBS_SECRET", "MISTRAL_API_KEY", "PUSH_DISPATCH_SECRET", "R2_CLEANUP_SECRET", "RATE_LIMIT_HMAC_SECRET", "RESEND_API_KEY", "STATENS_VEGVESEN_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "TURNSTILE_SECRET_KEY", "VAPID_PRIVATE_KEY", "VIPPS_ENVIRONMENT", "VIPPS_TEST_CLIENT_ID", "VIPPS_TEST_CLIENT_SECRET", "VIPPS_TEST_MSN", "VIPPS_TEST_SUBSCRIPTION_KEY", "VIPPS_TEST_WEBHOOK_SECRET"]' "$4" >/dev/null
jq -e '.VIPPS_ENVIRONMENT == "test"' "$4" >/dev/null
touch "$MARKER"
''')
    for command in ('curl', 'bunx'):
        (temp / command).chmod(0o700)
    env = dict(os.environ, PATH=directory + ':' + os.environ['PATH'],
               OPERATION='sync', OLD_IMAGE_JOBS_SECRET='old-secret', OLD_STATUS='401', DOPPLER_TOKEN='fake', CLOUDFLARE_API_TOKEN='fake',
               CLOUDFLARE_ACCOUNT_ID='fake',
               FIXTURE=str(temp / 'fixture'), MARKER=str(temp / 'worker'),
               DATABASE=str(temp / 'database'), PUSH_DATABASE=str(temp / 'push-database'),
               PUSH_URL='https://staging.kaupet.no/api/public/push/dispatch', PUSH_GOOD_STATUS='400', PUSH_BAD_STATUS='401', FAIL_PUSH_POST='0', GITHUB_STEP_SUMMARY=str(temp / 'summary'),
               JOB_URL='https://staging.kaupet.no/api/public/images/process', FAIL_POST='0')
    pair = json.loads(subprocess.check_output(['node', '-e', 'const c=require("node:crypto");const e=c.createECDH("prime256v1");e.generateKeys();process.stdout.write(JSON.stringify({private:e.getPrivateKey().toString("base64url"),public:e.getPublicKey().toString("base64url")}));']))
    env.update(HIDE_AUTH='0', FAIL_AUTH_POST='0', AUTH_DATABASE=str(temp / 'auth-database'), GITHUB_ENV=str(temp / 'github-env'), VITE_VAPID_PUBLIC_KEY=pair['public'], CLEANUP_URL='https://staging.kaupet.no/api/public/r2/cleanup', CLEANUP_DATABASE=str(temp / 'cleanup-database'), FAIL_CLEANUP_POST='0', CLEANUP_BAD_STATUS='401')
    valid = {'CLOUDFLARE_API_TOKEN':'fake-cf', 'SUPABASE_ACCESS_TOKEN':'fake-pat', 'RESEND_API_KEY':'re_fake', 'TURNSTILE_SECRET_KEY':'fake-turnstile', 'MISTRAL_API_KEY': 'fake-key', 'IMAGE_JOBS_SECRET': 'fake-secret', 'PUSH_DISPATCH_SECRET': 'fake-push', 'PUSH_DISPATCH_SECRET_PREVIOUS': 'old-push', 'SUPABASE_SERVICE_ROLE_KEY': 'fake-service-role', 'R2_CLEANUP_SECRET': 'fake-cleanup', 'RATE_LIMIT_HMAC_SECRET': 'fake-hmac', 'VAPID_PRIVATE_KEY': pair['private'], 'EXTRA': 'excluded'}
    valid.update({'VIPPS_TEST_CLIENT_ID': 'fake-vipps_test_client_id', 'VIPPS_TEST_CLIENT_SECRET': 'fake-vipps_test_client_secret', 'VIPPS_TEST_SUBSCRIPTION_KEY': 'fake-vipps_test_subscription_key', 'VIPPS_TEST_MSN': 'fake-vipps_test_msn', 'VIPPS_TEST_WEBHOOK_SECRET': 'fake-vipps_test_webhook_secret', 'STATENS_VEGVESEN_API_KEY': 'fake-statens_vegvesen_api_key'})
    cases = [(valid, {}, True, True)]
    for invalid in (None, '', 42, 'line\nbreak'):
        cases.append((dict(valid, IMAGE_JOBS_SECRET=invalid), {}, False, False))
    for invalid in (None, 42, 'line\nbreak'):
        cases.append((dict(valid, SUPABASE_SERVICE_ROLE_KEY=invalid), {}, False, False))
    cases.append(({k: v for k, v in valid.items() if k != 'SUPABASE_SERVICE_ROLE_KEY'}, {}, False, False))
    cases += [(valid, {'JOB_URL': 'https://example.invalid'}, False, False),
              (valid, {'FAIL_POST': '1'}, False, True),
              (dict(valid, SUPABASE_SERVICE_ROLE_KEY=''), {}, False, False)]
    cases += [(valid, {'OPERATION': 'verify'}, True, False),
              (valid, {'OPERATION': 'verify', 'OLD_IMAGE_JOBS_SECRET': ''}, True, False),
              (valid, {'OPERATION': 'verify', 'OLD_IMAGE_JOBS_SECRET': '', 'OLD_STATUS': '200'}, False, False),
              (valid, {'OPERATION': 'verify', 'OLD_STATUS': '200'}, False, False),
              (valid, {'OPERATION': 'verify', 'OLD_IMAGE_JOBS_SECRET': 'fake-secret'}, False, False),
              (valid, {'OPERATION': 'invalid'}, False, False)]
    for invalid in (None, '', 42, 'line\nbreak'):
        cases.append((dict(valid, PUSH_DISPATCH_SECRET=invalid), {}, False, False))
    cases += [(valid, {'PUSH_URL': 'https://example.invalid'}, False, False),
              (valid, {'FAIL_PUSH_POST': '1'}, False, True),
              (valid, {'OPERATION': 'verify', 'PUSH_GOOD_STATUS': '401'}, False, False),
              (valid, {'OPERATION': 'verify', 'PUSH_BAD_STATUS': '400'}, False, False),
              (dict(valid, PUSH_DISPATCH_SECRET_PREVIOUS=''), {'OPERATION': 'verify'}, True, False),
              (dict(valid, PUSH_DISPATCH_SECRET_PREVIOUS='fake-push'), {'OPERATION': 'verify'}, False, False)]
    for key in ('VIPPS_TEST_CLIENT_ID', 'VIPPS_TEST_CLIENT_SECRET', 'VIPPS_TEST_SUBSCRIPTION_KEY', 'VIPPS_TEST_MSN', 'VIPPS_TEST_WEBHOOK_SECRET', 'STATENS_VEGVESEN_API_KEY', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'SUPABASE_ACCESS_TOKEN', 'CLOUDFLARE_API_TOKEN', 'R2_CLEANUP_SECRET', 'RATE_LIMIT_HMAC_SECRET', 'VAPID_PRIVATE_KEY'):
        for invalid in (None, '', 42, 'line\nbreak'):
            cases.append((dict(valid, **{key: invalid}), {}, False, False))
    cases += [(valid, {'CLEANUP_URL': 'https://example.invalid'}, False, False),
              (valid, {'FAIL_CLEANUP_POST': '1'}, False, True),
              (valid, {'CLEANUP_BAD_STATUS': '200'}, False, True),
              (valid, {'VITE_VAPID_PUBLIC_KEY': 'wrong-key'}, False, False)]
    cases += [(valid, {'OPERATION':'bootstrap'}, True, False), (valid, {'FAIL_AUTH_POST':'1'}, False, False), (valid, {'HIDE_AUTH':'1'}, True, True), (valid, {'HIDE_AUTH':'1','OPERATION':'verify'}, True, False)]
    for payload, overrides, success, written in cases:
        (temp / 'auth-database').write_text(json.dumps({'smtp_pass':'re_fake','security_captcha_secret':'fake-turnstile'}))
        (temp / 'fixture').write_text(json.dumps(payload))
        (temp / 'worker').unlink(missing_ok=True)
        (temp / 'database').write_text(json.dumps([{'value': 'fake-secret'}]))
        (temp / 'push-database').write_text(json.dumps([{'value': 'fake-push'}]))
        (temp / 'cleanup-database').write_text(json.dumps([{'value': 'fake-cleanup'}]))
        result = subprocess.run(['bash', '-c', script], env=env | overrides, capture_output=True)
        assert (result.returncode == 0) == success, result.stderr.decode()
        assert (temp / 'worker').exists() == written
        if overrides.get('OPERATION') == 'verify':
            assert json.loads((temp / 'auth-database').read_text()) == {'smtp_pass':'re_fake','security_captcha_secret':'fake-turnstile'}
            for file, value in [('database', 'fake-secret'), ('push-database', 'fake-push'), ('cleanup-database', 'fake-cleanup')]:
                assert json.loads((temp / file).read_text()) == [{'value': value}]
print(f'{len(cases)} Doppler-staging checks passed')

staging_deploy = (root / '.github/workflows/ci.yml').read_text().split('  deploy-staging:', 1)[1]
assert 'secrets.R2_CLEANUP_SECRET' not in staging_deploy
assert 'scripts/doppler-staging.sh' in staging_deploy
