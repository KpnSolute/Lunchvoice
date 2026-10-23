# Project-scoped MCP servers

MCP servers for LunchVoice are configured **in this repository only** (project scope), with their secrets
in a private per-project file. Nothing here touches your global Claude account, global MCP config or other
projects, and other projects can do the same with their own repository, token and project ref.

## How it is wired

| Piece | What it does |
| --- | --- |
| `.mcp.json` | Claude Code project config (also `.cursor/mcp.json`, `.vscode/mcp.json`). Starts `scripts/mcp/supabase.sh`. No secrets in it. |
| `.mcp.env` | **Your private secrets**, gitignored, must be `chmod 600`. Copy from `.mcp.env.example`. |
| `scripts/mcp/lib.sh` | Validates and loads `.mcp.env`; prints only to stderr (stdout is the MCP protocol). |
| `scripts/mcp/supabase.sh` | Starts the Supabase MCP server **read-only**, scoped to one project, version pinned. |
| `scripts/mcp/with-env.sh` | Generic wrapper: `bash scripts/mcp/with-env.sh <command...>` runs any command with `.mcp.env` loaded. Use it for the next server. |
| `scripts/mcp/doctor.sh` | Checks the setup and confirms the project ref exists for your token (one read-only API request). Prints no secrets. |

## Set up (once, about two minutes)

1. Create a Supabase access token in the Supabase dashboard (Account > Access Tokens) for this project.
2. `cp .mcp.env.example .mcp.env && chmod 600 .mcp.env`, then put the token after `SUPABASE_ACCESS_TOKEN=`.
3. `bash scripts/mcp/doctor.sh` and confirm it reports your project's name (it should read LunchVoicev2 after the rename).
4. Restart Claude Code in this folder and approve the project MCP server when asked.

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

Copy `scripts/mcp/`, `.mcp.env.example`, the `.gitignore` entry and a project-specific `.mcp.json` into the other repository,
change the project ref, and give it its own token. Keep `.mcp.json` free of secrets so it is safe to commit.

## Unrelated servers you may see in Claude

Connectors added in your claude.ai account (for example a Supabase connector linked to another project) are **account-level**
and appear in every project. They are not part of this repository. To stop them appearing, disconnect or disable them in
claude.ai connector settings, or turn them off per session in the app. This repository's configuration cannot remove them.
