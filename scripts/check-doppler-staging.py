"""Offline check: run the workflow shell with fake HTTP and Wrangler commands."""
from pathlib import Path
import json
import os
import subprocess
import tempfile
import textwrap

root = Path(__file__).resolve().parents[1]
script = textwrap.dedent(
    (root / '.github/workflows/doppler-staging.yml').read_text().split('        run: |\n', 1)[1]
)
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
  https://api.doppler.com/*) cp "$FIXTURE" "$output" ;;
  *key=eq.push_dispatch_url*) printf '[{"value":"%s"}]' "$PUSH_URL" > "$output" ;;
  *key=eq.push_dispatch_secret*) cp "$PUSH_DATABASE" "$output" ;;
  https://staging.kaupet.no/api/public/push/dispatch)
    if [[ "$push_secret" == fake-push ]]; then printf '%s' "$PUSH_GOOD_STATUS"; else printf '%s' "$PUSH_BAD_STATUS"; fi ;;
  *key=eq.image_jobs_url*) printf '[{"value":"%s"}]' "$JOB_URL" > "$output" ;;
  *on_conflict=key*)
    [[ "$FAIL_POST" == 0 ]] || exit 22
    jq -e '(.key == "image_jobs_secret" or .key == "push_dispatch_secret") and (.value | type == "string")' "${data#@}" >/dev/null
    destination="$DATABASE"
    if [[ "$(jq -r .key "${data#@}")" == push_dispatch_secret ]]; then
      [[ "$FAIL_PUSH_POST" == 0 ]] || exit 22
      destination="$PUSH_DATABASE"
    fi
    jq '[{value: .value}]' "${data#@}" > "$destination"
    ;;
  *key=eq.image_jobs_secret*) cp "$DATABASE" "$output" ;;
  https://staging.kaupet.no/api/public/images/process) if [[ -n "$write_out" ]]; then printf '%s' "$OLD_STATUS"; else echo '{"claimed":0}' > "$output"; fi ;;
  *) exit 1 ;;
esac
''')
    (temp / 'bunx').write_text('''#!/bin/bash
set -eu
[[ "$1 $2 $3" == "wrangler secret bulk" && "$5 $6" == "--name kaupet-no-staging" ]]
jq -e 'keys == ["IMAGE_JOBS_SECRET", "MISTRAL_API_KEY", "PUSH_DISPATCH_SECRET"]' "$4" >/dev/null
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
    valid = {'MISTRAL_API_KEY': 'fake-key', 'IMAGE_JOBS_SECRET': 'fake-secret', 'PUSH_DISPATCH_SECRET': 'fake-push', 'PUSH_DISPATCH_SECRET_PREVIOUS': 'old-push', 'SUPABASE_SERVICE_ROLE_KEY': 'fake-service-role', 'EXTRA': 'excluded'}
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
    for payload, overrides, success, written in cases:
        (temp / 'fixture').write_text(json.dumps(payload))
        (temp / 'worker').unlink(missing_ok=True)
        (temp / 'database').write_text(json.dumps([{'value': 'fake-secret'}]))
        (temp / 'push-database').write_text(json.dumps([{'value': 'fake-push'}]))
        result = subprocess.run(['bash', '-c', script], env=env | overrides, capture_output=True)
        assert (result.returncode == 0) == success, result.stderr.decode()
        assert (temp / 'worker').exists() == written
print(f'{len(cases)} Doppler-staging checks passed')
