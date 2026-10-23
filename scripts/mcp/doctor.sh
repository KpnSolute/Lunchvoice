#!/usr/bin/env bash
# Check this project's MCP setup without changing anything and without printing secrets.
#   bash scripts/mcp/doctor.sh
# It does one read-only Supabase Management API request (GET project) with your token to
# confirm that the project ref in this repository exists in the account the token belongs to.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=scripts/mcp/lib.sh
. "$HERE/lib.sh"

fail=0
ok() { printf 'ok    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

if git -C "$ROOT" check-ignore -q .mcp.env 2>/dev/null; then ok ".mcp.env is gitignored"; else bad ".mcp.env is NOT gitignored"; fi

unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_MCP_READ_ONLY SUPABASE_MCP_VERSION
errfile="$(mktemp)"
if ( lv_mcp_load_env ) >/dev/null 2>"$errfile"; then
  ok ".mcp.env exists and is owner-only"
else
  bad "$(cat "$errfile")"
  rm -f "$errfile"
  exit 1
fi
rm -f "$errfile"
lv_mcp_load_env

if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then ok "SUPABASE_ACCESS_TOKEN is set (value not shown)"; else bad "SUPABASE_ACCESS_TOKEN is empty"; exit 1; fi

REF="${SUPABASE_PROJECT_REF:-$(sed -n 's/^project_id *= *"\(.*\)".*/\1/p' "$ROOT/supabase/config.toml" | head -n 1)}"
if [ -n "$REF" ]; then
  ok "project ref: $REF (supabase/config.toml unless overridden)"
else
  bad "no project ref"
  exit 1
fi

if [ "${SUPABASE_MCP_READ_ONLY:-true}" = "false" ]; then
  printf 'warn  read_only is OFF: the MCP server may write to project %s\n' "$REF"
else
  ok "read-only mode is on"
fi

if ! command -v curl >/dev/null 2>&1; then bad "curl not found; skipping the project lookup"; exit "$fail"; fi
tmp="$(mktemp)"
code="$(curl -sS -o "$tmp" -w '%{http_code}' -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" "https://api.supabase.com/v1/projects/${REF}" 2>/dev/null || echo 000)"
case "$code" in
  200)
    if command -v jq >/dev/null 2>&1; then
      ok "project found: $(jq -r '"name=\(.name // "?") status=\(.status // "?") region=\(.region // "?")"' "$tmp")"
    else
      ok "project found (install jq to show its name)"
    fi
    ;;
  401 | 403) bad "token rejected (HTTP $code): check the token and its account" ;;
  404) bad "project $REF not found in the token's account (wrong ref, renamed, or a different account)" ;;
  *) bad "unexpected HTTP $code from the Supabase API" ;;
esac
rm -f "$tmp"
exit "$fail"
