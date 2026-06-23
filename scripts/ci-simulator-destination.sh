#!/usr/bin/env bash
# Resolves an xcodebuild -destination string for an available iOS Simulator.
# Usage: ci-simulator-destination.sh [iphone|ipad]
set -euo pipefail

FAMILY="$(printf '%s' "${1:-iphone}" | tr '[:upper:]' '[:lower:]')"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEME="${CI_XCODE_SCHEME:-Twenty}"

case "$FAMILY" in
  iphone|phone)
    PATTERN='iPhone'
    FALLBACK_NAME='iPhone 16'
    ;;
  ipad|pad)
    PATTERN='iPad'
    FALLBACK_NAME='iPad (A16)'
    ;;
  *)
    echo "Unknown device family: $FAMILY (expected iphone or ipad)" >&2
    exit 1
    ;;
esac

DESTINATIONS="$(xcodebuild \
  -project "$PROJECT_ROOT/Twenty.xcodeproj" \
  -scheme "$SCHEME" \
  -showdestinations 2>/dev/null || true)"

pick_from_showdestinations() {
  echo "$DESTINATIONS" \
    | grep -E 'platform:iOS Simulator' \
    | grep -E "$PATTERN" \
    | grep -Ev 'placeholder|Any iOS Simulator Device' \
    | head -1 \
    | sed -E 's/.*id:([^,} ]+).*/platform=iOS Simulator,id=\1/'
}

DEST="$(pick_from_showdestinations || true)"

if [[ -z "$DEST" ]]; then
  # Fall back to name + latest OS when id parsing fails (older Xcode output shapes).
  RUNTIME="$(xcrun simctl list runtimes available -j \
    | /usr/bin/python3 -c 'import json,sys; data=json.load(sys.stdin); ios=[r for r in data.get("runtimes",[]) if r.get("isAvailable") and "iOS" in r.get("name","")]; print(sorted(ios,key=lambda r: r.get("version",""))[-1]["version"] if ios else "")' \
    || true)"
  if [[ -n "$RUNTIME" ]]; then
    DEST="platform=iOS Simulator,name=${FALLBACK_NAME},OS=${RUNTIME}"
  else
    DEST="platform=iOS Simulator,name=${FALLBACK_NAME}"
  fi
fi

echo "$DEST"
