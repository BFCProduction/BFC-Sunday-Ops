#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

NODE_BIN="${NODE_BIN:-}"
if [[ -z "${NODE_BIN}" ]]; then
  NODE_BIN="$(command -v node || true)"
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: node was not found in PATH. Install Node.js or set NODE_BIN."
  exit 1
fi

cd "${REPO_ROOT}"
exec "${NODE_BIN}" "${REPO_ROOT}/scripts/propresenter-relay.js"
