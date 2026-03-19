#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LABEL="com.bfc.sundayops.propresenter-relay"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/BFC-Sunday-Ops"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/${LABEL}.plist"
WRAPPER_PATH="${REPO_ROOT}/scripts/run-propresenter-relay.sh"
HOUR="${RELAY_LAUNCH_HOUR:-5}"
MINUTE="${RELAY_LAUNCH_MINUTE:-0}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--hour N] [--minute N]

Installs a per-user LaunchAgent that starts the ProPresenter relay automatically.

Options:
  --hour N     Hour to start the relay each day (0-23). Default: ${HOUR}
  --minute N   Minute to start the relay each day (0-59). Default: ${MINUTE}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hour)
      HOUR="${2:-}"
      shift 2
      ;;
    --minute)
      MINUTE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "${HOUR}" =~ ^[0-9]+$ ]] || (( HOUR < 0 || HOUR > 23 )); then
  echo "Error: --hour must be an integer from 0 to 23." >&2
  exit 1
fi

if ! [[ "${MINUTE}" =~ ^[0-9]+$ ]] || (( MINUTE < 0 || MINUTE > 59 )); then
  echo "Error: --minute must be an integer from 0 to 59." >&2
  exit 1
fi

mkdir -p "${LAUNCH_AGENTS_DIR}" "${LOG_DIR}"
chmod +x "${WRAPPER_PATH}"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${WRAPPER_PATH}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${HOUR}</integer>
    <key>Minute</key>
    <integer>${MINUTE}</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/propresenter-relay.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/propresenter-relay.error.log</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

plutil -lint "${PLIST_PATH}" >/dev/null

launchctl bootout "gui/$(id -u)" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl enable "gui/$(id -u)/${LABEL}"

echo "Installed ${LABEL}"
echo "Plist: ${PLIST_PATH}"
echo "Logs: ${LOG_DIR}/propresenter-relay.log"
echo "Errors: ${LOG_DIR}/propresenter-relay.error.log"
echo "Schedule: daily at $(printf '%02d:%02d' "${HOUR}" "${MINUTE}") local time"
