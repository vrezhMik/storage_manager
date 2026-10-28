#!/usr/bin/env bash
# Started by pm2: loads ~/translator/env (written by setup.sh) and runs the service.
set -euo pipefail
set -a
. "$HOME/translator/env"
set +a
exec "$HOME/translator/venv/bin/python" "$(cd "$(dirname "$0")" && pwd)/server.py"
