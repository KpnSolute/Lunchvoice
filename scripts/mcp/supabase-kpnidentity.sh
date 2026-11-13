#!/usr/bin/env bash
# Start the Supabase MCP server for the KpnIdentity project (stdio, read/write).
#
# This is a SECOND, separate project from the Lunchvoice deployment target and uses its
# own token. It must never share SUPABASE_ACCESS_TOKEN with supabase.sh, because a single
# token would silently expose this project through the other server.
#
# - Scoped to one project with --project-ref (KPNIDENTITY_SUPABASE_PROJECT_REF).
# - Read/write (user requested). Override with KPNIDENTITY_SUPABASE_MCP_READ_ONLY=true to restrict.
# - Version pinned (override with KPNIDENTITY_MCP_VERSION in .mcp.env).
# Nothing is written to stdout except by the MCP server itself.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/mcp/lib.sh
. "$HERE/lib.sh"

unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_MCP_READ_ONLY SUPABASE_MCP_VERSION
unset KPNIDENTITY_ACCESS_TOKEN KPNIDENTITY_PROJECT_REF KPNIDENTITY_MCP_READ_ONLY KPNIDENTITY_MCP_VERSION
unset KPNIDENTITY_SUPABASE_ACCESS_TOKEN KPNIDENTITY_SUPABASE_PROJECT_REF KPNIDENTITY_SUPABASE_MCP_READ_ONLY
# Preserve a default for the message below before the env file can override it.
KPNIDENTITY_PROJECT_REF=axzwdbizblfkspduqilj
lv_mcp_load_env

KPNIDENTITY_ACCESS_TOKEN="${KPNIDENTITY_SUPABASE_ACCESS_TOKEN:-${KPNIDENTITY_ACCESS_TOKEN:-}}"
KPNIDENTITY_PROJECT_REF="${KPNIDENTITY_SUPABASE_PROJECT_REF:-${KPNIDENTITY_PROJECT_REF:-axzwdbizblfkspduqilj}}"
KPNIDENTITY_MCP_READ_ONLY="${KPNIDENTITY_SUPABASE_MCP_READ_ONLY:-${KPNIDENTITY_MCP_READ_ONLY:-false}}"

if [ -z "${KPNIDENTITY_ACCESS_TOKEN:-}" ]; then
  echo "[mcp] KPNIDENTITY_SUPABASE_ACCESS_TOKEN is empty in .mcp.env." >&2
  echo "[mcp] add a token that has access to project ${KPNIDENTITY_PROJECT_REF:-axzwdbizblfkspduqilj}." >&2
  exit 1
fi

REF="$KPNIDENTITY_PROJECT_REF"
VERSION="${KPNIDENTITY_MCP_VERSION:-0.13.0}"

args=("--project-ref=$REF")
if [ "$KPNIDENTITY_MCP_READ_ONLY" = "true" ]; then
  args+=("--read-only")
fi

echo "[mcp] supabase-kpnidentity ${VERSION} project=${REF} read_only=${KPNIDENTITY_MCP_READ_ONLY}" >&2
# The token is per-project, so hand it to this server process only.
SUPABASE_ACCESS_TOKEN="$KPNIDENTITY_ACCESS_TOKEN" \
  exec npx -y "@supabase/mcp-server-supabase@${VERSION}" "${args[@]}"
