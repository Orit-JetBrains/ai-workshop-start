#!/usr/bin/env bash
# Air cloud startup: install dependencies for Skill Atlas (Node >= 24, TypeScript run natively by node).
# WARMUP runs (snapshot baking) also prove the environment with the same checks as CI.
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

cd "$(dirname "$0")/../.."

healthcheck() {
  echo "[healthcheck] node $(node -v)"
  echo "[healthcheck] typecheck"
  npm run typecheck
  echo "[healthcheck] tests"
  npm test
  echo "[healthcheck] CLI smoke test on ./fixture"
  ./skill-atlas help >/dev/null
  ./skill-atlas scan ./fixture >/dev/null
  echo "[healthcheck] OK"
}

node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$node_major" -lt 24 ]; then
  echo "Node >= 24 is required, found: $(node -v 2>/dev/null || echo none)" >&2
  exit 1
fi

echo "[startup] npm ci (node $(node -v), npm $(npm -v))"
npm ci --no-audit --no-fund
echo "[startup] dependencies installed"

if [ -n "${WARMUP:-}" ]; then healthcheck; fi
