# LunchVoice API and Discord bot (founder direction 2026-11-08)

Binding for the API/Discord track. Order of authority: `LAUNCH_PLAN.md`, the master spec, then this file. Nothing
here weakens anonymity, suppression, guest rules or entitlements, and nothing special-cases a customer: a company
that integrates for one of its tenants (for example KpnSolute for one of its customers) does so through the same
public API and its own Hub key as every Team customer. No customer name appears in code, fixtures or copy.

## 1. LunchVoice API (Team family only)

- **Hub API keys** (Hub Settings, API tab; Owner or a new `api.manage` capability). Scopes: `campaigns:read`,
  `campaigns:write` (create, edit draft, schedule, publish, close), `invites:write`, `results:read` (released
  aggregates only), `webhooks:manage`. Stored hashed (prefix shown, secret shown once), revocable, last-used time,
  per-key rate limit. A key acts for its Hub only. Keys stop working (and webhooks pause) while the Hub has no active
  Team-family entitlement; nothing is deleted.
- **REST `/v1`** served by an Edge Function `api` (`verify_jwt = false`; it authenticates the key itself). Every
  operation maps onto existing `lv` logic with the same authorization and suppression: results come only from the
  strict engine (withheld stays withheld, never zero), never individual anonymous answers, never respondent
  identities for anonymous Campaigns, never guest keys.
- **Webhooks**: `campaign.published`, `campaign.closed`, `campaign.responses_milestone` (counts released by the
  suppression engine only). Signed `t=…,v1=HMAC-SHA256` with a per-endpoint secret shown once; retries with backoff;
  delivery log without payload bodies.
- Docs page `/developers` (reference, scopes, examples, rate limits) and `API_CONTRACT.md` section.

## 2. Official LunchVoice Discord bot

- **Interactions endpoint** (Edge Function `discord`, verifies Discord's Ed25519 signature; fails closed without
  `DISCORD_PUBLIC_KEY`). Slash commands registered with `DISCORD_APPLICATION_ID` + `DISCORD_BOT_TOKEN` (secrets,
  names only).
- **Account link**: `/lunchvoice link` → one-time, short-lived link to `lunchvoice.com/connect/discord?c=…`; the person
  signs in with KpnSolute and confirms; the link stores the Discord user id as a linked handle (never an identity
  key), consent version, and time. `/lunchvoice unlink` and an Account Settings control remove it. Account deletion
  removes links.
- **Posting Campaigns**: a Hub manager connects a Discord server/channel to the Hub (proved by running
  `/lunchvoice connect` as a Discord server admin and confirming in LunchVoice). `/lunchvoice post` posts a Campaign
  card with an Answer button; optional auto-post on publish.
- **Answering (privacy decision D-01)**: anonymous Campaigns are always answered in the LunchVoice player (the button
  opens it), because Discord sees component clicks. Identified polls may be answered inside Discord with buttons,
  recorded as that linked person's identified answer, with the usual one-answer rule.
- **Role rules (per server, configured by that server's admins)**: map LunchVoice facts to Discord roles: "waitlist
  Founding member", "member of Hub X" (only a Hub the configuring person manages), "has a Team Hub". Applied when a
  person links or clicks Verify; removed when the fact stops being true on the next check. A server only learns the
  facts its rules ask about, and only for people who linked and consented. No server is special-cased in code.
- Rate limits and abuse: per-server and per-user command limits; staff can disable a server's connection from
  `/admin`.

## 3. Founder setup (names only)

Discord Developer Portal: create the application and bot; set the Interactions Endpoint URL to the deployed `discord`
function; copy Application ID, Public Key and Bot Token into Supabase secrets `DISCORD_APPLICATION_ID`,
`DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`; invite the bot with `applications.commands` + `bot` (Manage Roles only if
role rules are used).
