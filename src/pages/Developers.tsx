// Track D: /developers, the public reference for the LunchVoice API, webhooks and the Discord bot.
// Mirrors docs/backend/API_CONTRACT.md ("LunchVoice API, webhooks and Discord (000024, track D)").
import { Link } from "react-router-dom";
import { Card } from "@/components/shadcn/card";
import { Notice, PageHeader, SectionTitle } from "@/components/shadcn/blocks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { API_SCOPE_ORDER, SCOPE_LABELS } from "../lib/integrationsApi";

const configured = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const PRE = "lv-pre";
const BASE = `${configured || "https://<project>.supabase.co"}/functions/v1/api/v1`;

const ENDPOINTS: [string, string, string, string][] = [
  ["GET", "/hub", "campaigns:read", "The Hub this key belongs to, and the key's scopes."],
  ["GET", "/campaigns", "campaigns:read", "Campaigns of the Hub."],
  ["POST", "/campaigns", "campaigns:write", "Create a draft: title, mode (survey, poll, rating, feedback), anonymity, description."],
  ["GET", "/campaigns/{id}", "campaigns:read", "One Campaign with its questions."],
  ["PATCH", "/campaigns/{id}", "campaigns:write", "Edit a draft's title or description."],
  ["POST", "/campaigns/{id}/questions", "campaigns:write", "Add a question: position, kind, prompt, config."],
  ["POST", "/campaigns/{id}/schedule", "campaigns:write", "Set opens_at and closes_at (ISO 8601)."],
  ["POST", "/campaigns/{id}/publish", "campaigns:write", "Publish (activate) a draft. Plan limits and the activation gate apply."],
  ["POST", "/campaigns/{id}/close", "campaigns:write", "Close a running Campaign."],
  ["POST", "/campaigns/{id}/invites", "invites:write", "Create an invite for an invite-only Campaign: max_uses, expires_at."],
  ["POST", "/invites", "invites:write", "Create a Hub membership invite: max_uses, expires_at."],
  ["GET", "/campaigns/{id}/results", "results:read", "Released aggregate results (see Privacy)."],
  ["GET", "/webhooks", "webhooks:manage", "Webhook endpoints and their recent delivery log."],
  ["POST", "/webhooks", "webhooks:manage", "Add an endpoint: url (https), events. Returns the signing secret once."],
  ["PATCH", "/webhooks/{id}", "webhooks:manage", "Change events or turn an endpoint on or off."],
  ["DELETE", "/webhooks/{id}", "webhooks:manage", "Delete an endpoint."],
];

const ERRORS: [string, string, string][] = [
  ["401", "lv_unauthenticated", "Missing, malformed, unknown or revoked key."],
  ["402", "lv_entitlement_required", "The Hub has no active Team plan. Keys are kept and work again once it does."],
  ["403", "lv_forbidden", "The key lacks a scope (error.missing), the key's creator no longer manages the API, or the Hub is suspended."],
  ["404", "lv_not_found", "No such endpoint, or a Campaign outside the key's Hub."],
  ["409", "lv_gate_blocked, lv_limit_reached, lv_lifecycle_invalid, lv_policy_undecided", "The action is not possible in the current state (error.reasons, limit, used)."],
  ["429", "lv_rate_limited", "Too many requests; wait error.retry_after seconds (also in Retry-After)."],
  ["400", "lv_invalid_input", "A field is missing, unknown or has the wrong type."],
];

const CURL = `curl -s ${BASE}/campaigns \\
  -H "Authorization: Bearer $LUNCHVOICE_API_KEY"

curl -s -X POST ${BASE}/campaigns \\
  -H "Authorization: Bearer $LUNCHVOICE_API_KEY" -H "content-type: application/json" \\
  -d '{"title":"Saturday long run","mode":"poll","anonymity":"identified"}'

curl -s -X POST ${BASE}/campaigns/$CAMPAIGN_ID/questions \\
  -H "Authorization: Bearer $LUNCHVOICE_API_KEY" -H "content-type: application/json" \\
  -d '{"position":1,"kind":"single_choice","prompt":"Which route?","config":{"options":["River","Hills","Park"]}}'

curl -s -X POST ${BASE}/campaigns/$CAMPAIGN_ID/publish -H "Authorization: Bearer $LUNCHVOICE_API_KEY"`;

const VERIFY = `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody: the request body exactly as received (a string), before JSON parsing.
export function verifyLunchVoice(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false; // replay window
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const given = String(parts.v1 ?? "");
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`;

const PAYLOAD = `{
  "id": "6f1c…",                      // event id: deduplicate on it
  "type": "campaign.responses_milestone",
  "created_at": "2026-11-08T18:00:00Z",
  "hub_id": "…",
  "data": {
    "campaign_id": "…", "title": "Saturday long run", "mode": "poll", "anonymity": "identified",
    "status": "active", "opens_at": null, "closes_at": "2026-11-15T18:00:00Z", "join_code": "XYZ789",
    "milestone": 10, "released_participants": 10
  }
}`;

export function Developers() {
  return (
    <div className="ui-page lv-narrow-page" data-testid="developers">
      <PageHeader eyebrow="Developers" title="LunchVoice API" sub="Connect your own tools to a Hub: create and run Campaigns, send invites, read released results and get webhooks. Available on the Team plan." />
      <div className="lv-stack-16">
        <Card className="lv-minw0">
          <SectionTitle>Authentication</SectionTitle>
          <p className="lv-m0">The Hub Owner, or someone with the “Manage API keys, webhooks and Discord” capability, creates keys in <strong>Hub settings → API</strong>. A key belongs to one Hub and acts with the permissions of the person who created it, narrowed by its scopes. The secret is shown once; LunchVoice stores only a hash.</p>
          <pre className={PRE} aria-label="Authorization header"><code>Authorization: Bearer lvk_xxxxxxxxxxxx_xxxxxxxx…</code></pre>
          <p className="ui-help lv-m0">Base URL: <code className="lv-break">{BASE}</code>. Keep keys on your server. A key stops working when it is revoked, when its creator loses the capability or leaves the Hub, and pauses while the Hub has no active Team plan.</p>
        </Card>

        <Card className="lv-minw0">
          <SectionTitle>Scopes</SectionTitle>
          <div className="lv-scroll-x"><Table>
            <TableHeader><TableRow><TableHead>Scope</TableHead><TableHead>Allows</TableHead></TableRow></TableHeader>
            <TableBody>{API_SCOPE_ORDER.map((s) => <TableRow key={s}><TableCell><code>{s}</code></TableCell><TableCell>{SCOPE_LABELS[s]}</TableCell></TableRow>)}</TableBody>
          </Table></div>
        </Card>

        <Card className="lv-minw0">
          <SectionTitle>Endpoints</SectionTitle>
          <div className="lv-scroll-x"><Table>
            <TableHeader><TableRow><TableHead>Method</TableHead><TableHead>Path</TableHead><TableHead>Scope</TableHead><TableHead>What it does</TableHead></TableRow></TableHeader>
            <TableBody>
              {ENDPOINTS.map(([m, p, s, d]) => (
                <TableRow key={m + p}><TableCell><code>{m}</code></TableCell><TableCell><code className="lv-break">{p}</code></TableCell><TableCell><code>{s}</code></TableCell><TableCell>{d}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table></div>
          <p className="ui-help lv-m0">Bodies are JSON objects; unknown fields are refused. Every answer is <code>{"{ ok: true, … }"}</code> or <code>{"{ ok: false, error: { code, message, … } }"}</code>, the same envelope the app uses.</p>
        </Card>

        <Card className="lv-minw0">
          <SectionTitle>Examples</SectionTitle>
          <pre className={PRE}><code>{CURL}</code></pre>
        </Card>

        <Card className="lv-minw0">
          <SectionTitle>Privacy of results</SectionTitle>
          <ul className="lv-stack-8 lv-m0">
            <li>Results come from the same suppression engine as the app. Anything withheld there is withheld here, and never reported as zero.</li>
            <li>Anonymous Campaigns release results only after they finish, and only when the group is large enough.</li>
            <li>The API never returns an individual answer: free-text answers are left out (<code>texts_omitted: true</code>), and no respondent identity is ever included.</li>
          </ul>
        </Card>

        <Card className="lv-minw0">
          <SectionTitle>Rate limits and errors</SectionTitle>
          <p className="lv-m0">Each key may make 60 requests per minute (Team plan). Over the limit you get <code>429 lv_rate_limited</code> with <code>Retry-After</code>.</p>
          <div className="lv-scroll-x"><Table>
            <TableHeader><TableRow><TableHead>HTTP</TableHead><TableHead>Code</TableHead><TableHead>Meaning</TableHead></TableRow></TableHeader>
            <TableBody>{ERRORS.map(([h, c, m]) => <TableRow key={c}><TableCell>{h}</TableCell><TableCell><code className="lv-break">{c}</code></TableCell><TableCell>{m}</TableCell></TableRow>)}</TableBody>
          </Table></div>
        </Card>

        <Card id="webhooks" className="lv-minw0">
          <SectionTitle>Webhooks</SectionTitle>
          <p className="lv-m0">Add endpoints in <strong>Hub settings → API</strong> or with <code>POST /webhooks</code>. Events:</p>
          <ul className="lv-stack-8 lv-m0">
            <li><code>campaign.published</code>: a Campaign was published.</li>
            <li><code>campaign.closed</code>: a Campaign closed (by a manager or at its end time), with the released participant count, or <code>null</code> while withheld.</li>
            <li><code>campaign.responses_milestone</code>: released responses reached 10, 25, 50, 100, 250, 500, 1000… Identified Campaigns only: anonymous counts are not released while they run.</li>
          </ul>
          <pre className={PRE}><code>{PAYLOAD}</code></pre>
          <p className="lv-m0">Every delivery is a <code>POST</code> with <code>LunchVoice-Event</code>, <code>LunchVoice-Delivery</code> and <code>LunchVoice-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</code>, where <code>v1</code> is HMAC-SHA256 of <code>t + "." + raw body</code> with your endpoint secret. Verify it before trusting the body:</p>
          <pre className={PRE}><code>{VERIFY}</code></pre>
          <p className="ui-help lv-m0">Answer with any 2xx within 10 seconds. 408, 409, 425, 429 and 5xx are retried with exponential backoff (up to 8 attempts); other answers are not. Redirects are not followed. Deliveries pause while the Hub has no Team plan and resume afterwards. The delivery log keeps status codes and timings, never bodies.</p>
        </Card>

        <Card className="lv-minw0">
          <SectionTitle>Discord bot</SectionTitle>
          <ul className="lv-stack-8 lv-m0">
            <li><code>/lunchvoice link</code> sends you a one-time link to connect your Discord account; <code>/lunchvoice unlink</code> or Account settings removes it.</li>
            <li><code>/lunchvoice connect hub:&lt;address&gt;</code> (server admins) connects the server to a Hub once a Hub manager confirms in LunchVoice.</li>
            <li><code>/lunchvoice post campaign:&lt;join code&gt;</code> posts a Campaign card. Anonymous Campaigns open the LunchVoice player; identified one-question polls can be answered with buttons.</li>
            <li><code>/lunchvoice setup</code> (server admins) maps LunchVoice facts to roles; <code>/lunchvoice verify</code> applies them. Facts are used only for people who linked and agreed.</li>
          </ul>
        </Card>

        <Notice tone="info">Questions about the API? <Link to="/support">Contact support</Link>.</Notice>
      </div>
    </div>
  );
}
