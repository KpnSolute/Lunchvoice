# Project-scoped MCP servers

MCP servers for LunchVoice are configured **in this repository only** (project scope), with their secrets
in a private per-project file. Nothing here touches your global Claude account, global MCP config or other
projects, and other projects can do the same with their own repository, token and project ref.

## How it is wired

| Piece | What it does |
| --- | --- |
| `.mcp.json` | Claude Code project config. Starts both project-scoped wrappers as `lunchvoice` and `kpnauth`. No secrets in it. |
| `opencode.json` | OpenCode project config for the same two wrappers. No secrets in it. |
| `.codex/config.toml` | Codex project config for the same two wrappers. Trust this project in Codex to load its project config. No secrets in it. |
| `.vscode/mcp.json` / `.cursor/mcp.json` | VS Code and Cursor project config for the same two wrappers. |
| `.mcp.env` | **Your private secrets**, gitignored, must be `chmod 600`. Copy from `.mcp.env.example`. |
| `scripts/mcp/lib.sh` | Validates and loads `.mcp.env`; prints only to stderr (stdout is the MCP protocol). |
| `scripts/mcp/supabase.sh` | Starts the Supabase MCP server for the LunchVoice project as `lunchvoice` — **read-only**, scoped to one project, version pinned. |
| `scripts/mcp/supabase-kpnidentity.sh` | Starts the Supabase MCP server for the KpnIdentity project as `kpnauth`, with its own token. |
| `scripts/mcp/with-env.sh` | Generic wrapper: `bash scripts/mcp/with-env.sh <command...>` runs any command with `.mcp.env` loaded. Use it for the next server. |
| `scripts/mcp/doctor.sh` | Checks the setup and confirms the project ref exists for your token (one read-only API request). Prints no secrets. |

> **Names are `lunchvoice` and `kpnauth`.** They were previously `supabase`, `supabase-local`,
> `supabase-lunchvoice` and `supabase-kpnidentity`, which was confusing: `supabase-local` pointed at the
> **production** LunchVoice project, not a local database. All five harness configs now agree.

## Set up (once, about two minutes)

1. Create a Supabase access token for each account in the Supabase dashboard (Account > Access Tokens).
2. `cp .mcp.env.example .mcp.env && chmod 600 .mcp.env`, then put the tokens in `LUNCHVOICE_SUPABASE_ACCESS_TOKEN` and `KPNIDENTITY_SUPABASE_ACCESS_TOKEN`. They must be different tokens from their respective accounts.
3. Confirm `LUNCHVOICE_SUPABASE_PROJECT_REF` targets the first project and `KPNIDENTITY_SUPABASE_PROJECT_REF` targets the second (defaults to the KpnIdentity project).
4. `bash scripts/mcp/doctor.sh` and confirm it reports the first project's name (it should read LunchVoicev2 after the rename).
5. Restart Claude Code, OpenCode, or Codex in this folder and approve/trust the project MCP configuration when asked.

Each agent reads its own configuration format; the three files above all start the same wrappers and use the same private `.mcp.env`. The tokens and project refs stay independent between the two Supabase servers.

## What the Supabase server can do

- **Read-only by default.** Set `SUPABASE_MCP_READ_ONLY=false` in `.mcp.env` only for a session where you want writes, then
  set it back. Do not point a writable server at production casually: it can run SQL and apply migrations.
- **One project.** `--project-ref` limits the server's tools to the ref from `supabase/config.toml` (or `SUPABASE_PROJECT_REF`).
- **The token is broader than the server.** A Supabase access token belongs to an *account* and can reach every project that
  account can. The project ref narrows what this MCP server exposes, not what the token could do elsewhere. For real isolation
  use a token from an account or organization membership that can only see this project (not verified here whether Supabase
  offers narrower tokens; check the dashboard). Rotate the token if it leaks.
- **Pinned version** (`0.13.0`, published 2026-09-17) instead of `@latest`, so a new upstream release cannot change behaviour
  silently. Upgrade by setting `SUPABASE_MCP_VERSION` after reading the release notes.

## Adding Render (not enabled yet, not verified end to end)

Render's MCP server is hosted at `https://mcp.render.com/mcp` and is authenticated with a Render API key (or OAuth). Facts
from Render's documentation as read on 2026-10-23: the key grants access to your workspaces and services; actions are scoped
to the selected workspace; it cannot delete resources, but it can change environment variables and trigger deploys. There is
no documented way to limit a key to one service or to read-only.

Because it is an HTTP server, `.mcp.json` would need `"headers": {"Authorization": "Bearer ${RENDER_API_KEY}"}` with the key
present in the process environment, which conflicts with keeping secrets only in `.mcp.env`. Options, in order of preference:
1. Use Render's OAuth plugin flow and keep it per project (no key on disk). Accept that it is account-level.
2. Use a stdio-to-HTTP bridge started through `with-env.sh` so the key is read from `.mcp.env`. No bridge package has been
   evaluated for this project; vet one before use.
3. Skip Render MCP and use the Render dashboard or CLI; it only adds convenience.

Do not enable a Render server with a key that can also reach unrelated workspaces.

## Other projects

Copy `scripts/mcp/`, `.mcp.env.example`, the `.gitignore` entry, and the configuration file(s) for the agents you use into the other repository. Change project refs and provide each server its own account token. Keep all agent config files free of secrets so they are safe to commit.

## Unrelated servers you may see in Claude

Connectors added in your claude.ai account (for example a Supabase connector linked to another project) are **account-level**
and appear in every project. They are not part of this repository. To stop them appearing, disconnect or disable them in
claude.ai connector settings, or turn them off per session in the app. This repository's configuration cannot remove them.
