"""Offline checks for platform allowlists and multiline GitHub environment values."""
from pathlib import Path
import json
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    (temp / 'curl').write_text('''#!/bin/bash
set -eu
while [[ $# -gt 0 ]]; do
  case "$1" in --output) cp "$FIXTURE" "$2"; exit 0 ;; esac
  shift
done
exit 1
''')
    (temp / 'curl').chmod(0o700)
    env = dict(os.environ, PATH=directory + ':' + os.environ['PATH'], DOPPLER_TOKEN='fake',
               FIXTURE=str(temp / 'fixture'), GITHUB_ENV=str(temp / 'github-env'))
    valid = {'ANDROID_GOOGLE_SERVICES_JSON': '{\n"project": "fake"\n}',
             'ANDROID_UPLOAD_KEYSTORE_PASSWORD': 'fake-password',
             'IOS_GOOGLE_SERVICE_INFO_PLIST': '<plist>\nfake\n</plist>',
             'SUPABASE_SERVICE_ROLE_KEY': 'excluded'}
    cases = [(valid, 'android-preview', True, ['ANDROID_GOOGLE_SERVICES_JSON']),
             (valid, 'android', True, ['ANDROID_GOOGLE_SERVICES_JSON', 'ANDROID_UPLOAD_KEYSTORE_PASSWORD']),
             (valid, 'ios', True, ['IOS_GOOGLE_SERVICE_INFO_PLIST']),
             ({}, 'android', True, []),
             (valid, 'invalid', False, [])]
    for invalid in (None, 42, [], {}):
        cases.append(({'ANDROID_GOOGLE_SERVICES_JSON': invalid}, 'android', False, []))
    for payload, platform, success, expected in cases:
        (temp / 'fixture').write_text(json.dumps(payload))
        (temp / 'github-env').unlink(missing_ok=True)
        result = subprocess.run(['bash', str(root / 'scripts/doppler-native.sh')], env=env | {'PLATFORM': platform}, capture_output=True)
        assert (result.returncode == 0) == success, result.stderr.decode()
        output = (temp / 'github-env').read_text() if (temp / 'github-env').exists() else ''
        remaining = output
        exported = []
        while remaining:
            header, remaining = remaining.split('\n', 1)
            key, delimiter = header.split('<<', 1)
            value, remaining = remaining.split('\n' + delimiter + '\n', 1)
            assert value == payload[key]
            exported.append(key)
        assert exported == expected
    print(f'{len(cases)} Doppler-native checks passed')
