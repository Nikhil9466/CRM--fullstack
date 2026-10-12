#!/usr/bin/env python3
"""Run the requested public demo and its backend as one stoppable service."""
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = Path.home() / '.local/state/crm-client-demo'
STATE_FILE = STATE_DIR / 'link.json'
FORWARDER = '/usr/share/code/bin/code-tunnel'
PORT = 4001
stopping = False


def stop_signal(_signum, _frame):
    global stopping
    stopping = True


def stop_child(child):
    if child is not None and child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=6)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=3)


def node_path():
    installed = list((Path.home() / '.nvm/versions/node').glob('v*/bin/node'))
    installed = [p for p in installed if os.access(p, os.X_OK)]
    if installed:
        def version(p):
            return tuple(int(n) for n in re.findall(r'\d+', p.parents[1].name))
        return str(max(installed, key=version))
    found = shutil.which('node')
    if found:
        return found
    raise RuntimeError('Node.js is missing. Install the CRM dependencies first.')


def origin_from_format(value):
    if not isinstance(value, str) or value.count('{port}') != 1:
        raise ValueError('Invalid forwarding address.')
    parsed = urlsplit(value.replace('{port}', str(PORT)))
    if (parsed.scheme != 'https' or not parsed.hostname or
            not re.fullmatch(r'[a-z0-9-]+\.[a-z0-9-]+\.devtunnels\.ms', parsed.hostname) or
            parsed.port or parsed.username or parsed.password or
            parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise ValueError('Invalid forwarding address.')
    return f'https://{parsed.netloc}'


def healthy(url):
    try:
        request = Request(url, headers={'X-Tunnel-Skip-AntiPhishing-Page': 'true'})
        with urlopen(request, timeout=4) as response:
            return response.status == 200 and json.load(response).get('status') == 'ok'
    except Exception:
        return False


def run():
    forwarder = backend = None
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.unlink(missing_ok=True)
    try:
        for required in ('front end/dist/login.html', 'front end/dist/home.html', 'crm-backend/.env'):
            if not (ROOT / required).is_file():
                raise RuntimeError(f'Missing {required}. Run npm start in the CRM folder first.')
        node = node_path()
        with socket.socket() as probe:
            # Match Node's reuse behavior so recently closed connections do not
            # make an immediate restart look like another running server.
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('127.0.0.1', PORT))
            except OSError:
                raise RuntimeError('Port 4001 is already in use. Stop the other demo first.')

        forwarder = subprocess.Popen(
            [FORWARDER, 'tunnel', 'forward-internal', '--provider', 'github'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, cwd=ROOT,
        )
        forwarder.stdin.write(json.dumps([{'number': PORT, 'privacy': 'public', 'protocol': 'http'}]) + '\n')
        forwarder.stdin.flush()
        messages = queue.Queue()

        def read_lines():
            for line in forwarder.stdout:
                try:
                    data = json.loads(line)
                    if isinstance(data, dict) and 'port_format' in data:
                        messages.put(data['port_format'])
                        continue
                except json.JSONDecodeError:
                    pass
                print(line.rstrip(), flush=True)

        threading.Thread(target=read_lines, daemon=True).start()
        origin = None
        ready = False
        deadline = time.monotonic() + 50
        while not stopping:
            if forwarder.poll() is not None:
                raise RuntimeError('The forwarding connection stopped. Check the internet connection or GitHub sign-in.')
            try:
                discovered = origin_from_format(messages.get(timeout=1))
            except queue.Empty:
                discovered = origin
            if discovered != origin:
                stop_child(backend)
                STATE_FILE.unlink(missing_ok=True)
                origin, ready = discovered, False
                deadline = time.monotonic() + 50
                backend = subprocess.Popen(
                    [node, str(ROOT / 'scripts/client-demo-server.cjs'), origin],
                    cwd=ROOT / 'crm-backend',
                )
            if backend is not None and backend.poll() is not None:
                raise RuntimeError('The demo backend stopped. Check the database and demo log.')
            if not ready and origin and healthy('http://127.0.0.1:4001/api/health') and healthy(origin + '/api/health'):
                state = {'origin': origin, 'url': origin + '/login.html'}
                temporary = STATE_FILE.with_suffix('.tmp')
                temporary.write_text(json.dumps(state) + '\n')
                temporary.replace(STATE_FILE)
                print('CRM DEMO READY: ' + state['url'], flush=True)
                ready = True
            if not ready and time.monotonic() > deadline:
                raise RuntimeError('The demo could not connect within 50 seconds. Check the internet, database, or GitHub sign-in.')
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        return 0 if stopping else 1
    finally:
        STATE_FILE.unlink(missing_ok=True)
        stop_child(backend)
        stop_child(forwarder)


if __name__ == '__main__':
    signal.signal(signal.SIGINT, stop_signal)
    signal.signal(signal.SIGTERM, stop_signal)
    raise SystemExit(run())
