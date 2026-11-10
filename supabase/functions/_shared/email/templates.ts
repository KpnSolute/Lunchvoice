// Transactional email templates (build plan B-02; design handoff E01-E08), as code. Plain, accessible, no images,
// no tracking pixels, no remote assets, no marketing. Every template renders a text part and an HTML part from the
// small outbox payload; user-supplied values (Hub and Campaign names) are escaped, and nothing here ever receives
// an answer.

export type TemplateId =
  | "waitlist_joined" // E01
  | "hub_created" // E03
  | "hub_invite" // E04
  | "reservation_confirmed" // E05 (purchase / renewal)
  | "reservation_expiring" // E05 (reminder)
  | "reservation_grace" // E06
  | "participation_receipt" // E07 (identified Campaigns only)
  | "shop_order"; // E08

export const TEMPLATE_IDS: readonly TemplateId[] = [
  "waitlist_joined", "hub_created", "hub_invite", "reservation_confirmed", "reservation_expiring", "reservation_grace",
  "participation_receipt", "shop_order",
];

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

type Payload = Record<string, unknown>;

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** One line of plain text: no control characters (so a name can never inject a header or a line). */
function clean(v: unknown, max = 120): string {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
}
const slugOf = (v: unknown) => { const s = clean(v, 40).toLowerCase(); return /^[a-z0-9-]{3,40}$/.test(s) ? s : ""; };
const codeOf = (v: unknown) => { const s = clean(v, 40).toUpperCase(); return /^[A-Z0-9-]{4,40}$/.test(s) ? s : ""; };
function dateOf(v: unknown): string {
  const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

interface Parts {
  subject: string;
  from?: string;
  heading: string;
  body: string[];
  action?: { label: string; url: string };
  footer: string;
}

function layout(p: Parts): Rendered {
  const text = [p.heading, "", ...p.body.flatMap((b) => [b, ""]), ...(p.action ? [`${p.action.label}: ${p.action.url}`, ""] : []), "--", p.footer].join("\n");
  const para = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2E2A25">${escapeHtml(s)}</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(p.subject)}</title></head>` +
    `<body style="margin:0;background:#EEEDEA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14110F">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:20px">` +
    `<tr><td style="height:5px;background:#FF9A18;border-radius:20px 20px 0 0"></td></tr>` +
    `<tr><td style="padding:28px 28px 8px;font-weight:800;font-size:16px">LunchVoice</td></tr>` +
    `<tr><td style="padding:0 28px 8px"><h1 style="margin:0;font-size:22px;font-weight:700;line-height:1.25">${escapeHtml(p.heading)}</h1></td></tr>` +
    `<tr><td style="padding:12px 28px 4px">${p.body.map(para).join("")}</td></tr>` +
    (p.action ? `<tr><td style="padding:4px 28px 24px"><a href="${escapeHtml(p.action.url)}" style="display:inline-block;background:#14110F;color:#F7F3EA;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:999px">${escapeHtml(p.action.label)}</a></td></tr>` : "") +
    `<tr><td style="padding:16px 28px 28px;font-size:12px;line-height:1.5;color:#6A645E;border-top:1px solid #E4E2DE">${escapeHtml(p.footer)}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject: clean(p.subject, 200), text, html };
}

/** Render a template, or null when the payload lacks what the template needs (the message is then failed, not sent). */
export function renderEmail(template: string, payload: Payload, appOrigin = "https://lunchvoice.com"): Rendered | null {
  const origin = appOrigin.replace(/\/+$/, "");
  const hub = clean(payload.hub_name, 80);
  switch (template as TemplateId) {
    case "waitlist_joined": {
      const admitted = payload.status === "admitted";
      return layout({
        subject: admitted ? "You have a Founding seat on LunchVoice" : "You're on the LunchVoice waitlist",
        heading: admitted ? "Your Founding seat is ready" : "You're on the list",
        body: admitted
          ? ["You were admitted from the waitlist. Your account now holds one Founding Hub credit, so you can create your Hub whenever you're ready.",
             "Founding Hubs keep Starter features free until 30 days after paid billing opens."]
          : [`You're number ${clean(payload.position, 10)} in line. A place on the list isn't a promise of a seat; we'll let you know if one opens.`,
             "You can take part in Campaigns and run free Quick Surveys any time."],
        action: admitted ? { label: "Create your Hub", url: `${origin}/create` } : { label: "Visit LunchVoice", url: `${origin}/waitlist` },
        footer: "You got this because you left this address when you joined the waitlist at lunchvoice.com. It's the only email the waitlist sends.",
      });
    }
    case "hub_created": {
      const slug = slugOf(payload.slug);
      if (!slug) return null;
      return layout({
        subject: `${hub || "Your Hub"} is live on LunchVoice`,
        heading: "Your Hub is ready",
        body: [`${hub || "Your Hub"} lives at lunchvoice.com/${slug}. You're its Owner.`, "Invite members, then run your first Campaign."],
        action: { label: "Open your Hub", url: `${origin}/${slug}` },
        footer: "You got this because you created a Hub on LunchVoice.",
      });
    }
    case "hub_invite": {
      const code = codeOf(payload.code);
      if (!code || !hub) return null;
      const inviter = clean(payload.inviter_name, 60);
      const expires = dateOf(payload.expires_at);
      return layout({
        subject: `${hub} invited you to join`,
        heading: `${inviter || "Someone"} invited you to ${hub}`,
        body: [`Accepting makes you a member of ${hub}. You can leave any time.${expires ? ` This invite expires on ${expires}.` : ""}`,
               `Your invite code is ${code}.`],
        action: { label: "Review invitation", url: `${origin}/j/${encodeURIComponent(code)}` },
        // FB-05: say who sent it and how to report abuse (invites are sent by Hub members, not by LunchVoice).
        footer: `${inviter || "A member"} of ${hub} sent this through LunchVoice. Didn't expect it? Ignore it; nothing happens unless you accept. To report abuse, write to admin@lunchvoice.com.`,
      });
    }
    case "reservation_confirmed": {
      const slug = slugOf(payload.slug);
      if (!slug) return null;
      const until = dateOf(payload.expires_at);
      return layout({
        subject: `lunchvoice.com/${slug} is reserved${until ? ` until ${until}` : ""}`,
        heading: payload.renewed ? "Your reservation is renewed" : "Your Hub name is reserved",
        body: [`Nobody else can create a Hub at lunchvoice.com/${slug}${until ? ` until ${until}` : ""}.`,
               "A reservation keeps the address only; it doesn't include paid Hub features."],
        action: { label: "Create the Hub", url: `${origin}/create` },
        footer: "Receipts and tax details come from Stripe in a separate email.",
      });
    }
    case "reservation_expiring": {
      const slug = slugOf(payload.slug);
      const on = dateOf(payload.expires_at);
      if (!slug || !on) return null;
      return layout({
        subject: `lunchvoice.com/${slug} expires on ${on}`,
        heading: "Your name reservation ends soon",
        body: [`Renew for $25 to keep lunchvoice.com/${slug} for another 12 months. It's separate from any Hub plan or Campaign access.`],
        action: { label: "Renew for $25", url: `${origin}/reserve?slug=${slug}` },
        footer: "After expiry the name stays protected for a 25-day grace period, then it is released.",
      });
    }
    case "reservation_grace": {
      const slug = slugOf(payload.slug);
      const until = dateOf(payload.grace_ends_at);
      const days = clean(payload.grace_days, 4) || "25";
      if (!slug || !until) return null;
      return layout({
        subject: `Renew lunchvoice.com/${slug} by ${until}`,
        heading: `Expired. Still protected until ${until}.`,
        body: [`Nobody else can claim ${slug} until ${until}. After that the reservation is released and the name may go to someone else.`,
               "A released name never shows anything of yours."],
        action: { label: "Renew for $25", url: `${origin}/reserve?slug=${slug}` },
        footer: `Grace is ${days} calendar days from expiry.`,
      });
    }
    case "participation_receipt": {
      const title = clean(payload.campaign_title, 120);
      const receipt = clean(payload.receipt_id, 40);
      if (!title || !/^[0-9a-f-]{36}$/i.test(receipt)) return null;
      return layout({
        subject: `Receipt: ${title}`,
        heading: "Thanks for taking part",
        body: [`This confirms you took part in "${title}"${hub ? ` in ${hub}` : ""}. It doesn't include what you answered.`,
               `Receipt ${receipt.slice(0, 8).toUpperCase()}.`],
        action: { label: "See your history", url: `${origin}/me` },
        footer: "Receipts are sent for identified Campaigns only. Anonymous Campaigns never send one.",
      });
    }
    case "shop_order": {
      const item = clean(payload.item, 80);
      if (!item || !hub) return null;
      const slug = slugOf(payload.slug);
      const pickup = clean(payload.pickup, 300);
      return layout({
        subject: `Your ${item} is ready`,
        heading: `${item} is ready for pickup`,
        body: [pickup ? `Pickup details from ${hub}: ${pickup}` : `${hub} will tell you how to pick it up.`],
        action: slug ? { label: "Open the Hub", url: `${origin}/${slug}` } : undefined,
        footer: `Sent because you placed an order in ${hub}'s shop. Points have no cash value.`,
      });
    }
    default:
      return null;
  }
}
