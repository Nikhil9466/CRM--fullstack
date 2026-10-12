#!/usr/bin/env bash
set -euo pipefail
crm_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
crm_config="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$crm_config"
cp "$crm_root/scripts/crm-client-demo.service" "$crm_config/crm-client-demo.service"
systemctl --user daemon-reload
systemctl --user reset-failed crm-client-demo.service 2>/dev/null || true
systemctl --user start crm-client-demo.service
python3 - <<'PY'
import json
from pathlib import Path
import subprocess
import time
from urllib.request import Request, urlopen

state = Path.home() / '.local/state/crm-client-demo/link.json'
deadline = time.monotonic() + 65
print('Starting your CRM client demo. This can take a few seconds.', flush=True)
while time.monotonic() < deadline:
    try:
        current = json.loads(state.read_text())
        request = Request(current['origin'] + '/api/health', headers={'X-Tunnel-Skip-AntiPhishing-Page': 'true'})
        with urlopen(request, timeout=5) as response:
            if response.status == 200 and json.load(response).get('status') == 'ok':
                print('\nYour CRM is live:\n' + current['url'])
                print('\nShare this link. Use your existing CRM login.')
                print('You can close this terminal and Codex. Keep the PC awake and online.')
                raise SystemExit(0)
    except (OSError, ValueError, KeyError):
        pass
    time.sleep(1)
print('The demo is not ready. Its recent messages are below:')
subprocess.run(['journalctl', '--user', '-u', 'crm-client-demo.service', '-n', '20', '--no-pager'])
raise SystemExit(1)
PY
