import type { LvTransport } from "./lvApi";
import { slugProblem } from "./reservedSlugs";

// In-memory stand-in for lv_api so the UI can be built before the backend ships
// read operations. Shapes follow the documented contract; it is not a policy
// engine (no suppression, no cohorts).
export function createMockTransport(displayName = "Dana"): LvTransport {
  const hubs: { hub_id: string; slug: string; name: string; is_owner: boolean }[] = [];
  const invites = new Map<string, string>();
  let n = 0;
  const id = () => `mock-${++n}`;
  const err = (code: string, message: string) => ({ ok: false, error: { code, message } });

  return {
    async rpc(fn, args = {}) {
      switch (fn) {
        case "lv_my_context":
          return { ok: true, account_id: "mock-account", display_name: displayName, email_verified: true, hubs };
        case "lv_hub_create": {
          const slug = String(args.p_slug).toLowerCase();
          if (slugProblem(slug)) return err("lv_invalid_input", "Slug is not allowed");
          if (hubs.some((h) => h.slug === slug)) return err("lv_conflict", "Slug is taken");
          const hub = { hub_id: id(), slug, name: String(args.p_name), is_owner: true };
          hubs.push(hub);
          return { ok: true, hub_id: hub.hub_id };
        }
        case "lv_invite_create": {
          const code = `MOCK${n + 1}`;
          invites.set(code, String(args.p_hub));
          return { ok: true, invite_id: id(), code };
        }
        case "lv_invite_redeem":
          return invites.has(String(args.p_code)) ? { ok: true, hub_id: invites.get(String(args.p_code)) } : err("lv_invalid_code", "Invalid code");
        case "lv_campaign_create":
          return { ok: true, campaign_id: id() };
        case "lv_submit_response":
          return { ok: true, receipt_id: id(), duplicate: false };
        default:
          return err("lv_not_found", `Mock does not implement ${fn}`);
      }
    },
  };
}
