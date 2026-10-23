#!/usr/bin/env bash
# Run any command with this project's private MCP secrets loaded from .mcp.env.
#
#   bash scripts/mcp/with-env.sh <command> [args...]
#
# Use it as the "command" of any stdio MCP server that needs a secret, so the secret
# stays project-local instead of living in your global shell or account.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/mcp/lib.sh
. "$HERE/lib.sh"

if [ "$#" -eq 0 ]; then
  echo "[mcp] usage: with-env.sh <command> [args...]" >&2
  exit 2
fi

lv_mcp_load_env
exec "$@"
