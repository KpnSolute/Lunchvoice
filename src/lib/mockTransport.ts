import type { LvTransport } from "./lvApi";
import { slugProblem } from "./reservedSlugs";

// DEV-ONLY stand-in for lv_api (excluded from production bundles; see transport.ts and
// scripts/check-bundle.mjs). Mirrors the documented shapes; it is not a policy engine.
// Real replacement: every case below is a function in docs/backend/API_CONTRACT.md.
const MIN_COHORT = 3;
type Q = { question_id: string; position: number; kind: string; prompt: string; config: object };
type C = {
  campaign_id: string; hub_id: string; title: string; mode: string; anonymity: string; status: string;
  created_at: string; join_code: string; questions: Q[]; responses: { receipt: string; answers: { question_id: string; value: unknown }[] }[];
};

export function createMockTransport(displayName = "Dana"): LvTransport {
  const hubs: { hub_id: string; slug: string; name: string }[] = [];
  const campaigns: C[] = [];
  const invites = new Map<string, { hub: string; invite_id: string; uses: number }>();
  let beta = "none";
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const err = (code: string, message: string) => ({ ok: false, error: { code, message } });
  const caps = ["hub.settings.manage", "admin.members.admit", "admin.members.remove", "admin.roles.manage", "campaign.manage", "analytics.read"];
  const hubOf = (slug: string) => hubs.find((h) => h.slug === slug);
  const row = (c: C) => ({
    campaign_id: c.campaign_id, title: c.title, mode: c.mode, anonymity: c.anonymity, status: c.status, opens_at: null,
    closes_at: null, created_at: c.created_at, question_count: c.questions.length, has_responded: c.responses.length > 0, join_code: c.join_code,
  });

  return {
    async rpc(fn, a = {}) {
      switch (fn) {
        case "lv_my_context":
          return {
            ok: true, account_id: "mock-account", display_name: displayName, email_verified: true, is_platform_admin: false, beta_status: beta,
            hubs: hubs.map((h) => ({ ...h, is_owner: true, roles: [], capabilities: caps })),
          };
        case "lv_beta_status":
          return { ok: true, status: beta };
        case "lv_beta_apply":
          beta = "approved";
          return { ok: true, application_id: id("beta") };
        case "lv_hub_create": {
          const slug = String(a.p_slug).toLowerCase();
          if (slugProblem(slug)) return err("lv_invalid_input", "That Hub address is not allowed");
          if (hubOf(slug)) return err("lv_conflict", "That Hub address is taken");
          const hub = { hub_id: id("hub"), slug, name: String(a.p_name) };
          hubs.push(hub);
          return { ok: true, hub_id: hub.hub_id, slug };
        }
        case "lv_hub_get": {
          const h = hubOf(String(a.p_slug));
          if (!h) return err("lv_not_found", "Hub not found");
          return {
            ok: true,
            hub: { ...h, visibility: "public", membership_mode: "invite_only", member_count: 1 },
            membership: { is_owner: true, roles: [], capabilities: caps, active_campaigns: campaigns.filter((c) => c.hub_id === h.hub_id && c.status === "active").length },
          };
        }
        case "lv_member_list":
          return { ok: true, members: [{ membership_id: "m-1", account_id: "mock-account", display_name: displayName, status: "accepted", accepted_at: null, is_owner: true, roles: [] }] };
        case "lv_invite_create": {
          const code = `MOCK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          const invite_id = id("inv");
          invites.set(code, { hub: String(a.p_hub), invite_id, uses: 0 });
          return { ok: true, invite_id, code, shown_once: true };
        }
        case "lv_invite_list":
          return {
            ok: true,
            invites: [...invites.values()].filter((i) => i.hub === a.p_hub).map((i) => ({ invite_id: i.invite_id, max_uses: null, uses: i.uses, expires_at: null, revoked_at: null, created_at: "", state: "active" })),
          };
        case "lv_invite_preview": {
          const i = invites.get(String(a.p_code));
          const h = i && hubs.find((x) => x.hub_id === i.hub);
          return h ? { ok: true, hub: h, already_member: true } : err("lv_invalid_code", "That invitation is not valid");
        }
        case "lv_invite_redeem": {
          const i = invites.get(String(a.p_code));
          return i ? { ok: true, hub_id: i.hub, already_member: true } : err("lv_invalid_code", "That invitation is not valid");
        }
        case "lv_invite_revoke":
          return { ok: true };
        case "lv_campaign_list":
          return { ok: true, campaigns: campaigns.filter((c) => c.hub_id === a.p_hub).map(row) };
        case "lv_campaign_get": {
          const c = campaigns.find((x) => x.campaign_id === a.p_campaign);
          if (!c) return err("lv_not_found", "Campaign not found");
          const gate = { ok: c.questions.length > 0 && c.status === "draft", reasons: [c.questions.length ? "" : "no_questions", c.status === "draft" ? "" : "not_draft"].filter(Boolean) };
          return {
            ok: true,
            campaign: { campaign_id: c.campaign_id, hub_id: c.hub_id, title: c.title, mode: c.mode, anonymity: c.anonymity, status: c.status, revision: 1, opens_at: null, closes_at: null },
            questions: c.questions, has_responded: c.responses.length > 0, receipt_id: c.responses[0]?.receipt ?? null,
            can_respond: c.status === "active" && c.responses.length === 0, can_manage: true, join_code: c.join_code, gate,
          };
        }
        case "lv_campaign_create": {
          const c: C = { campaign_id: id("cmp"), hub_id: String(a.p_hub), title: String(a.p_title), mode: String(a.p_mode), anonymity: String(a.p_anonymity ?? "anonymous"), status: "draft", created_at: new Date().toISOString(), join_code: `J${n}`, questions: [], responses: [] };
          campaigns.push(c);
          return { ok: true, campaign_id: c.campaign_id };
        }
        case "lv_campaign_question_add": {
          const c = campaigns.find((x) => x.campaign_id === a.p_campaign);
          if (!c) return err("lv_not_found", "Campaign not found");
          if (c.status !== "draft") return err("lv_locked", "Questions cannot change after activation");
          const q = { question_id: id("q"), position: Number(a.p_position), kind: String(a.p_kind), prompt: String(a.p_prompt), config: (a.p_config as object) ?? {} };
          c.questions.push(q);
          return { ok: true, question_id: q.question_id };
        }
        case "lv_campaign_activate": {
          const c = campaigns.find((x) => x.campaign_id === a.p_campaign);
          if (!c) return err("lv_not_found", "Campaign not found");
          if (!c.questions.length) return err("lv_gate_blocked", "no_questions");
          c.status = "active";
          return { ok: true };
        }
        case "lv_campaign_close": {
          const c = campaigns.find((x) => x.campaign_id === a.p_campaign);
          if (c) c.status = "closed";
          return { ok: true };
        }
        case "lv_submit_response": {
          const c = campaigns.find((x) => x.campaign_id === a.p_campaign);
          if (!c) return err("lv_not_found", "Campaign not found");
          if (c.status !== "active") return err("lv_closed", "This Campaign is not accepting responses");
          if (c.responses.length) return { ok: true, receipt_id: c.responses[0].receipt, duplicate: true };
          c.responses.push({ receipt: id("rcpt"), answers: a.p_answers as C["responses"][number]["answers"] });
          return { ok: true, receipt_id: c.responses[0].receipt, duplicate: false };
        }
        case "lv_analytics_query": {
          const c = campaigns.find((x) => x.campaign_id === a.p_campaign);
          if (!c) return err("lv_not_found", "Campaign not found");
          if (c.status === "draft") return err("lv_lifecycle_invalid", "Results are not available for a draft");
          if (c.anonymity === "anonymous" && c.status === "active") return err("lv_policy_undecided", "Anonymous results appear after the Campaign finishes");
          const total = c.responses.length;
          if (a.p_metric === "participant_count") return { ok: true, metric: "participant_count", n: total >= MIN_COHORT ? total : null, suppressed: total < MIN_COHORT };
          const counts = new Map<string, number>();
          for (const r of c.responses) for (const x of r.answers) if (x.question_id === a.p_question) counts.set(String(x.value), (counts.get(String(x.value)) ?? 0) + 1);
          return { ok: true, metric: "answer_distribution", question_id: a.p_question, cells: [...counts].map(([key, k]) => ({ key, n: k >= MIN_COHORT ? k : null, suppressed: k < MIN_COHORT, reason: k < MIN_COHORT ? "below_min_cohort" : null })) };
        }
        default:
          return err("lv_not_found", `Mock does not implement ${fn}`);
      }
    },
  };
}
