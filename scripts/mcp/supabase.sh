#!/usr/bin/env bash
# Start the Supabase MCP server for THIS project only (stdio).
#
# - Scoped to one project with --project-ref (default: project_id in supabase/config.toml).
# - Read-only by default. Set SUPABASE_MCP_READ_ONLY=false in .mcp.env to allow writes.
# - Version pinned (override with SUPABASE_MCP_VERSION in .mcp.env). Upgrade deliberately.
# - The access token comes only from .mcp.env, never from your global environment.
# Nothing is written to stdout except by the MCP server itself.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=scripts/mcp/lib.sh
. "$HERE/lib.sh"

# Ignore anything inherited from the global shell; only .mcp.env counts.
unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_MCP_READ_ONLY SUPABASE_MCP_VERSION
lv_mcp_load_env

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "[mcp] SUPABASE_ACCESS_TOKEN is empty in .mcp.env." >&2
  exit 1
fi

REF="${SUPABASE_PROJECT_REF:-$(sed -n 's/^project_id *= *"\(.*\)".*/\1/p' "$ROOT/supabase/config.toml" | head -n 1)}"
if [ -z "$REF" ]; then
  echo "[mcp] no project ref: set SUPABASE_PROJECT_REF or project_id in supabase/config.toml." >&2
  exit 1
fi

VERSION="${SUPABASE_MCP_VERSION:-0.13.0}"
args=("--project-ref=$REF")
if [ "${SUPABASE_MCP_READ_ONLY:-true}" != "false" ]; then
  args+=("--read-only")
fi

echo "[mcp] supabase ${VERSION} project=${REF} read_only=${SUPABASE_MCP_READ_ONLY:-true}" >&2
exec npx -y "@supabase/mcp-server-supabase@${VERSION}" "${args[@]}"
