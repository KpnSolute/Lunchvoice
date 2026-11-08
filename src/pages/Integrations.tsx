// Track D: the LunchVoice API, webhooks and Discord in the app (docs/v2/API_AND_DISCORD_PLAN.md).
//   HubApiSettings     Hub Settings -> API tab (keys and webhooks; Team family; Owner or api.manage)
//   HubDiscordSettings Hub Settings -> Discord tab (server connections, auto-post)
//   AccountDiscord     Account Settings card (linked Discord, Unlink)
//   ConnectDiscord     /connect/discord?c=CODE (one-time code from /lunchvoice link or /lunchvoice connect)
// The backend decides everything; disabled controls only explain.
import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { HubInfo, HubMembership } from "../lib/lvApi";
import { API_SCOPE_ORDER, maskedKey, SCOPE_LABELS, WEBHOOK_EVENTS, webhookUrlProblem, type ApiScope, type WebhookEvent } from "../lib/integrationsApi";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/shadcn/switch";
import { Badge } from "@/components/shadcn/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { CopyField, EmptyState, Field, LoadingRows, Notice, PageHeader, RowItem, RowList, SectionTitle } from "@/components/shadcn/blocks";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";

// Local confirm (Studio's ConfirmAction would pull the Studio chunk into Account settings).
function ConfirmAction({ trigger, title, body, action, onConfirm }: { trigger: React.ReactNode; title: string; body: string; action: string; onConfirm: () => Promise<unknown> | unknown }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const canManageApi = (m: HubMembership | null) => Boolean(m?.is_owner || m?.capabilities.includes("api.manage"));
const canManageHub = (m: HubMembership | null) => Boolean(m?.is_owner || m?.capabilities.includes("hub.settings.manage"));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

/** A secret shown exactly once, with a copy control. */
function SecretOnce({ open, title, secret, onClose, children }: { open: boolean; title: string; secret: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid="secret-once">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copy it now. LunchVoice stores only a hash and will never show it again.</DialogDescription>
        </DialogHeader>
        <CopyField value={secret} label="Secret" />
        {children}
        <div className="ui-row"><Button variant="ink" onClick={onClose}>I have copied it</Button></div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ API tab */

export function HubApiSettings({ hub, membership }: { hub: HubInfo; membership: HubMembership | null }) {
  const { api } = useIdentity();
  const allowed = canManageApi(membership);
  const keys = useLv(() => (allowed ? api.apiKeysList(hub.hub_id) : Promise.resolve({ ok: true as const, enabled: false, rate_per_minute: null, max_keys: null, scopes: [], keys: [] })), [api, hub.hub_id, allowed]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["campaigns:read", "results:read"]);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  if (!allowed) return <Notice tone="info">Only the Owner or someone with the “Manage API keys, webhooks and Discord” capability can see this tab.</Notice>;
  if (keys.loading && !keys.data) return <LoadingRows rows={3} />;
  if (keys.error) return <Notice tone="error">{describeError(keys.error)}</Notice>;
  const d = keys.data!;
  const active = d.keys.filter((k) => k.active);

  async function create() {
    setBusy(true);
    const r = await api.apiKeyCreate(hub.hub_id, name.trim(), scopes);
    setBusy(false);
    if (!r.ok) { toast.error(describeError(r.error)); return; }
    setSecret(r.secret);
    setName("");
    keys.reload();
  }

  return (
    <div className="lv-stack-16" data-testid="api-tab">
      {!d.enabled && (
        <Notice tone="info" title="The LunchVoice API is part of the Team plan">
          Keys and webhooks work while this Hub has an active Team plan. Existing keys are kept and pause while it doesn’t. <Link to={`/${hub.slug}/billing`}>See plans</Link>
        </Notice>
      )}
      <Card>
        <SectionTitle action={<Link to="/developers">API reference</Link>}>API keys</SectionTitle>
        <p className="ui-muted lv-m0">
          A key acts for {hub.name} only, with the permissions of the person who created it, narrowed by its scopes.
          {d.rate_per_minute ? ` Each key may make ${d.rate_per_minute} requests per minute.` : ""}
          {" "}Results through the API are the same released aggregates you see here: withheld stays withheld, and no individual answer is ever returned.
        </p>
        <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <Field label="Key name" htmlFor="api-key-name" help="For you: where the key is used." counter={{ value: name.length, max: 60 }}>
            <Input id="api-key-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Results sync" />
          </Field>
          <fieldset className="lv-stack-8">
            <legend className="ui-label">Scopes</legend>
            {API_SCOPE_ORDER.map((s) => (
              <label key={s} className="ui-row" htmlFor={`scope-${s}`}>
                <Checkbox id={`scope-${s}`} checked={scopes.includes(s)}
                  onCheckedChange={(c) => setScopes((cur) => (c ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)))} />
                <span><code>{s}</code> <span className="ui-muted">{SCOPE_LABELS[s]}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="ui-row">
            <Button type="submit" variant="ink" disabled={!d.enabled || busy || !name.trim() || scopes.length === 0}>{busy ? "Creating…" : "Create key"}</Button>
            {d.max_keys !== null && <span className="ui-help">{active.length} of {d.max_keys} active keys</span>}
          </div>
        </form>
        {d.keys.length === 0 ? (
          <EmptyState title="No keys yet">Create a key to connect your own tools to {hub.name}.</EmptyState>
        ) : (
          <RowList>
            {d.keys.map((k) => (
              <RowItem
                key={k.key_id}
                title={<>{k.name} {!k.active && <Badge variant="outline">Revoked</Badge>}</>}
                sub={<><code data-testid="key-prefix">{maskedKey(k.prefix)}</code> · {k.scopes.join(", ")} · Last used: {when(k.last_used_at)}</>}
                trailing={k.active ? (
                  <ConfirmAction
                    trigger={<Button variant="danger" size="sm">Revoke</Button>}
                    title={`Revoke “${k.name}”?`}
                    body="Anything using this key stops working at once. This can’t be undone; create a new key instead."
                    action="Revoke key"
                    onConfirm={async () => {
                      const r = await api.apiKeyRevoke(k.key_id);
                      if (r.ok) { toast.success("Key revoked"); keys.reload(); } else toast.error(describeError(r.error));
                    }}
                  />
                ) : undefined}
              />
            ))}
          </RowList>
        )}
      </Card>
      <WebhooksCard hub={hub} />
      <SecretOnce open={secret !== null} title="Your new API key" secret={secret ?? ""} onClose={() => setSecret(null)}>
        <p className="ui-help lv-m0">Send it as <code>Authorization: Bearer …</code>. Keep it on your server; never put it in a web page or app.</p>
      </SecretOnce>
    </div>
  );
}

function WebhooksCard({ hub }: { hub: HubInfo }) {
  const { api } = useIdentity();
  const list = useLv(() => api.webhookList(hub.hub_id), [api, hub.hub_id]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const problem = url.trim() ? webhookUrlProblem(url) : null;

  if (list.loading && !list.data) return <Card><LoadingRows rows={2} /></Card>;
  if (list.error) return <Card><Notice tone="error">{describeError(list.error)}</Notice></Card>;
  const d = list.data!;

  async function create() {
    setBusy(true);
    const r = await api.webhookCreate(hub.hub_id, url.trim(), events);
    setBusy(false);
    if (!r.ok) { toast.error(describeError(r.error)); return; }
    setSecret(r.secret);
    setUrl("");
    list.reload();
  }

  return (
    <Card>
      <SectionTitle>Webhooks</SectionTitle>
      <p className="ui-muted lv-m0">LunchVoice posts signed JSON when a Campaign is published, closes, or reaches a released response milestone. Milestones use released counts only, so anonymous Campaigns never send one while they run.</p>
      <form className="lv-stack-16" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <Field label="Endpoint URL" htmlFor="wh-url" error={problem ?? undefined}>
          <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.northside-running.org/lunchvoice" inputMode="url" />
        </Field>
        <fieldset className="lv-stack-8">
          <legend className="ui-label">Events</legend>
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="ui-row" htmlFor={`ev-${ev}`}>
              <Checkbox id={`ev-${ev}`} checked={events.includes(ev)} onCheckedChange={(c) => setEvents((cur) => (c ? [...new Set([...cur, ev])] : cur.filter((x) => x !== ev)))} />
              <code>{ev}</code>
            </label>
          ))}
        </fieldset>
        <div className="ui-row">
          <Button type="submit" variant="secondary" disabled={!d.enabled || busy || !url.trim() || Boolean(problem) || events.length === 0}>{busy ? "Adding…" : "Add endpoint"}</Button>
        </div>
      </form>
      {d.endpoints.length > 0 && (
        <RowList>
          {d.endpoints.map((e) => (
            <RowItem
              key={e.endpoint_id}
              title={<span className="break-all">{e.url}</span>}
              sub={<>{e.events.join(", ")} · {e.recent_deliveries.length ? `last delivery: ${e.recent_deliveries[0].outcome}${e.recent_deliveries[0].status_code ? ` (${e.recent_deliveries[0].status_code})` : ""}` : "no deliveries yet"}{e.disabled_reason ? ` · ${e.disabled_reason}` : ""}</>}
              trailing={
                <span className="ui-row">
                  <Switch aria-label={`Deliver to ${e.url}`} checked={e.enabled} onCheckedChange={async (on) => {
                    const r = await api.webhookUpdate(e.endpoint_id, { enabled: on });
                    if (r.ok) list.reload(); else toast.error(describeError(r.error));
                  }} />
                  <ConfirmAction
                    trigger={<Button variant="quiet" size="sm">Delete</Button>}
                    title="Delete this endpoint?"
                    body="Queued deliveries to it are dropped. The delivery log goes with it."
                    action="Delete endpoint"
                    onConfirm={async () => { const r = await api.webhookDelete(e.endpoint_id); if (r.ok) list.reload(); else toast.error(describeError(r.error)); }}
                  />
                </span>
              }
            />
          ))}
        </RowList>
      )}
      <SecretOnce open={secret !== null} title="Your webhook signing secret" secret={secret ?? ""} onClose={() => setSecret(null)}>
        <p className="ui-help lv-m0">Verify the <code>LunchVoice-Signature</code> header with it. See <Link to="/developers#webhooks">how</Link>.</p>
      </SecretOnce>
    </Card>
  );
}

/* ------------------------------------------------------------------ Discord tab */

export function HubDiscordSettings({ hub, membership }: { hub: HubInfo; membership: HubMembership | null }) {
  const { api } = useIdentity();
  const allowed = canManageHub(membership);
  const list = useLv(() => (allowed ? api.discordConnections(hub.hub_id) : Promise.resolve({ ok: true as const, connections: [] })), [api, hub.hub_id, allowed]);
  if (!allowed) return <Notice tone="info">Only Hub managers can connect Discord servers.</Notice>;
  return (
    <div className="lv-stack-16" data-testid="discord-tab">
      <Card>
        <SectionTitle>Discord servers</SectionTitle>
        <p className="ui-muted lv-m0">
          Add the LunchVoice bot to your server, then a server admin runs <code>/lunchvoice connect hub:{hub.slug}</code> and you confirm the link it posts.
          Members can then use <code>/lunchvoice post</code> to share published Campaigns. Anonymous Campaigns are always answered in LunchVoice, never inside Discord.
        </p>
        {list.loading && !list.data ? <LoadingRows rows={2} /> : list.error ? <Notice tone="error">{describeError(list.error)}</Notice> : list.data!.connections.length === 0 ? (
          <EmptyState title="No server connected">Connected servers show up here.</EmptyState>
        ) : (
          <RowList>
            {list.data!.connections.map((c) => (
              <RowItem
                key={c.connection_id}
                title={<>{c.guild_name ?? "Discord server"} {c.disabled && <Badge variant="outline">Turned off by LunchVoice</Badge>}</>}
                sub={`Connected ${new Date(c.confirmed_at).toLocaleDateString()} · ${c.role_rules} role rule${c.role_rules === 1 ? "" : "s"} for this Hub`}
                trailing={
                  <span className="ui-row">
                    <label className="ui-row ui-help" htmlFor={`auto-${c.connection_id}`}>
                      <Switch id={`auto-${c.connection_id}`} checked={c.auto_post} onCheckedChange={async (on) => {
                        const r = await api.discordConnectionUpdate(c.connection_id, { auto_post: on });
                        if (r.ok) list.reload(); else toast.error(describeError(r.error));
                      }} />Auto-post on publish
                    </label>
                    <ConfirmAction
                      trigger={<Button variant="quiet" size="sm">Disconnect</Button>}
                      title="Disconnect this server?"
                      body="The server can no longer post this Hub’s Campaigns, and its membership role rules for this Hub are removed."
                      action="Disconnect"
                      onConfirm={async () => { const r = await api.discordConnectionUpdate(c.connection_id, { remove: true }); if (r.ok) list.reload(); else toast.error(describeError(r.error)); }}
                    />
                  </span>
                }
              />
            ))}
          </RowList>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Account Settings */

export function AccountDiscord() {
  const { api } = useIdentity();
  const me = useLv(() => api.discordMe(), [api]);
  const link = me.data?.link ?? null;
  return (
    <Card data-testid="account-discord">
      <SectionTitle>Discord</SectionTitle>
      {me.loading && !me.data ? <LoadingRows rows={1} /> : link ? (
        <div className="lv-stack-8">
          <p className="lv-m0">Linked to <strong>@{link.discord_username ?? "Discord user"}</strong> since {new Date(link.linked_at).toLocaleDateString()}.</p>
          <p className="ui-help lv-m0">{link.role_facts_consent ? "Servers you verify in may give you roles based on the facts their rules ask about." : "Servers cannot use LunchVoice facts for your roles."} Your Discord account is a linked handle, never how you sign in.</p>
          <div className="ui-row">
            <ConfirmAction
              trigger={<Button variant="secondary">Unlink Discord</Button>}
              title="Unlink Discord?"
              body="Roles LunchVoice gave you in Discord servers are removed. You can link again any time with /lunchvoice link."
              action="Unlink"
              onConfirm={async () => { const r = await api.discordUnlink(); if (r.ok) { toast.success("Discord unlinked"); me.reload(); } else toast.error(describeError(r.error)); }}
            />
          </div>
        </div>
      ) : (
        <p className="ui-muted lv-m0">Not linked. In a server with the LunchVoice bot, run <code>/lunchvoice link</code> and open the link it sends you.</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ /connect/discord */

export function ConnectDiscord() {
  const { api, session } = useIdentity();
  const [params] = useSearchParams();
  const location = useLocation();
  const code = (params.get("c") ?? "").trim();
  const preview = useLv(() => (session && code ? api.discordCodePreview(code) : Promise.resolve({ ok: false as const, error: { code: "lv_invalid_code" as const, message: "This link is missing its code. Run the command in Discord again." } })), [api, session, code]);
  const [agree, setAgree] = useState(false);
  const [roles, setRoles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "link" | "connect">(null);

  if (!session) {
    return (
      <div className="ui-page lv-narrow-page">
        <PageHeader eyebrow="Discord" title="Connect Discord" sub="Sign in to LunchVoice to continue. The code in this link works once and expires after 10 minutes." />
        <Card><div className="ui-row"><Button asChild variant="ink"><Link to="/signin" state={{ from: location.pathname + location.search }}>Sign in to continue</Link></Button></div></Card>
      </div>
    );
  }

  const p = preview.data;
  async function confirm() {
    if (!p) return;
    setBusy(true);
    const r = p.kind === "link" ? await api.discordLinkConfirm(code, p.consent_version, roles) : await api.discordConnectConfirm(code);
    setBusy(false);
    if (!r.ok) { toast.error(describeError(r.error)); return; }
    setDone(p.kind);
  }

  return (
    <div className="ui-page lv-narrow-page" data-testid="connect-discord">
      <PageHeader eyebrow="Discord" title={p?.kind === "connect" ? "Connect a Discord server" : "Link your Discord account"} />
      <Card>
        {preview.loading && !p ? <LoadingRows rows={2} /> : done ? (
          <Notice tone="ok" title={done === "link" ? "Discord linked" : "Server connected"}>
            {done === "link"
              ? "Run /lunchvoice verify in your server to get any roles it gives. You can unlink in Account settings."
              : <>The server can now post this Hub’s Campaigns. Manage it in <Link to={`/${p?.hub?.slug}/settings`}>Hub settings</Link>.</>}
          </Notice>
        ) : preview.error ? (
          <Notice tone="error">{describeError(preview.error)}</Notice>
        ) : p!.kind === "link" ? (
          <div className="lv-stack-16">
            {p!.already_linked && <Notice tone="warn">Your LunchVoice account is already linked to Discord. Unlink it in Account settings first.</Notice>}
            <p className="lv-m0">Link the Discord account <strong>@{p!.discord_username ?? "unknown"}</strong>{p!.guild_name ? <> (from {p!.guild_name})</> : null} to your LunchVoice account?</p>
            <div className="ui-help lv-stack-8">
              <p className="lv-m0">LunchVoice stores your Discord user id as a linked handle, the time and this notice’s version ({p!.consent_version}). It never becomes how you sign in.</p>
              <p className="lv-m0">Identified polls you answer with Discord buttons are recorded as your identified answers. Anonymous Campaigns are always answered in LunchVoice, so Discord never sees those answers.</p>
            </div>
            <label className="ui-row" htmlFor="dc-agree"><Checkbox id="dc-agree" checked={agree} onCheckedChange={(c) => setAgree(Boolean(c))} />I understand and want to link this account</label>
            <label className="ui-row" htmlFor="dc-roles"><Checkbox id="dc-roles" checked={roles} onCheckedChange={(c) => setRoles(Boolean(c))} />
              <span>Let servers I verify in give me roles based on LunchVoice facts their rules ask about: waitlist Founding member, member of a Hub, has a Team Hub. <span className="ui-muted">Optional.</span></span>
            </label>
            <div className="ui-row"><Button variant="ink" disabled={!agree || busy || p!.already_linked} onClick={() => void confirm()}>{busy ? "Linking…" : "Link Discord"}</Button></div>
          </div>
        ) : (
          <div className="lv-stack-16">
            <p className="lv-m0">Connect <strong>{p!.guild_name ?? "this Discord server"}</strong> to <strong>{p!.hub?.name}</strong>?</p>
            <p className="ui-help lv-m0">Linked members who manage Campaigns in {p!.hub?.name} can post published Campaigns there. You can turn on auto-post or disconnect in Hub settings.</p>
            <div className="ui-row"><Button variant="ink" disabled={busy} onClick={() => void confirm()}>{busy ? "Connecting…" : "Connect server"}</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}
