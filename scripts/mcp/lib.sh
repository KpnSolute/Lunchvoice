#!/usr/bin/env bash
# Shared helpers for this project's MCP wrappers. Source this file; do not run it.
#
# Design: MCP secrets live in ONE gitignored, owner-only file in THIS repository
# (.mcp.env). They are loaded only into the process that needs them, never printed,
# and are never read from the global shell environment, so another project's token
# cannot be picked up by accident.

lv_mcp_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

# lv_mcp_load_env: validate and load .mcp.env (or $LV_MCP_ENV_FILE).
# Exits the calling script with a message on stderr if the file is missing or too open.
# stdout is never written: MCP stdio servers use stdout for the protocol.
lv_mcp_load_env() {
  local root env_file perm
  root="$(lv_mcp_root)"
  env_file="${LV_MCP_ENV_FILE:-$root/.mcp.env}"
  if [ ! -f "$env_file" ]; then
    echo "[mcp] missing $env_file. Copy .mcp.env.example to .mcp.env and fill it in." >&2
    exit 1
  fi
  perm="$(stat -c '%a' "$env_file")"
  case "$perm" in
    600 | 400) ;;
    *)
      echo "[mcp] $env_file must be owner-only (chmod 600); found mode $perm." >&2
      exit 1
      ;;
  esac
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
}
