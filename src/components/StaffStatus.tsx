// Staff panel (000023): the staff entry in the account menu (platform admins only) and the account-suspension
// notice. Both read lv_my_context; neither decides anything (the backend enforces staff rights and suspension).
import { useNavigate } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { Badge } from "@/components/shadcn/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/shadcn/dropdown-menu";
import { Notice } from "@/components/shadcn/blocks";
import { SUPPORT_EMAIL, supportMailto } from "../config/contact";

/** Rendered inside the open account menu, so the context is read only when the menu opens. */
export function StaffMenuItem() {
  const { api } = useIdentity();
  const nav = useNavigate();
  const ctx = useLv(() => api.myContext(), [api]);
  if (!ctx.data?.is_platform_admin) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => nav("/admin")} data-testid="staff-menu-item">
        <Badge variant="ink">Staff</Badge> Staff panel
      </DropdownMenuItem>
    </>
  );
}

/** A suspended account sees why, and what still works. */
export function AccountSuspendedNotice() {
  const { api, session } = useIdentity();
  const ctx = useLv(() => (session ? api.myContext() : Promise.resolve({ ok: false as const, error: { code: "lv_unauthenticated" as const, message: "" } })), [api, session]);
  const s = ctx.data?.suspension;
  if (!s?.suspended) return null;
  return (
    <Notice tone="error" title="Your account is suspended" className="lv-suspended-notice">
      LunchVoice staff suspended it: {s.reason} You can still sign in, read, leave Hubs and delete your data, but you can’t answer Campaigns, join Hubs, create or publish anything, post, comment or order. To appeal, write to <a href={supportMailto("Appeal: account suspension")}>{SUPPORT_EMAIL}</a>.
    </Notice>
  );
}
