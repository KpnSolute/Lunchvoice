import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import { reasonLabel } from "../lib/reports";
import { ReportDialog } from "../components/ReportDialog";
import { LinkButton } from "../components/ui";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Field, Notice } from "@/components/shadcn/blocks";

/** "lunchvoice.com/Beta-Squad/" -> "beta-squad" */
export const hubAddress = (raw: string) => raw.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?lunchvoice\.com\//i, "").replace(/^\/+/, "").split(/[/?#]/)[0].toLowerCase();

/**
 * Support page: report something the way you would in a chat app. A person (from where you met them), a Hub (by address)
 * or a survey (by code). Reports go straight to LunchVoice staff and attach to the account or Hub reported.
 */
export function ReportCenter() {
  const { api, session } = useIdentity();
  const mine = useLv(() => (session ? api.myReports() : Promise.resolve({ ok: false as const, error: { code: "lv_unauthenticated" as const, message: "" } })), [api, session?.name]);
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const slug = hubAddress(address);
  const cleanCode = code.trim().toUpperCase();

  return (
    <Card data-testid="report-center" className="lv-report-center">
      <h2 className="lv-mk-card-title">Report something</h2>
      <p className="lv-mk-card-body">Reports go straight to LunchVoice staff, who can act on the account, Hub or survey. The person you report is never told it was you.</p>
      <Tabs defaultValue="hub">
        <TabsList aria-label="What are you reporting?">
          <TabsTrigger value="person">A person</TabsTrigger>
          <TabsTrigger value="hub">A Hub</TabsTrigger>
          <TabsTrigger value="survey">A survey</TabsTrigger>
        </TabsList>

        <TabsContent value="person">
          <div className="lv-stack-16">
            <p className="lv-m0">The best place to report a person is where you met them, so staff can see the context.</p>
            <ul className="lv-report-steps">
              <li>On a <strong>comment</strong>: choose <em>Report</em> next to their name.</li>
              <li>In a Hub you manage: <strong>Members</strong>, then <em>Report</em> on their row.</li>
              <li>Can’t find them? Write to <a className="lv-inline-link" href="mailto:admin@lunchvoice.com?subject=Report%20a%20person">admin@lunchvoice.com</a> with the Hub address and their name.</li>
            </ul>
            {session && <LinkButton to="/me" variant="secondary">Open my Hubs</LinkButton>}
          </div>
        </TabsContent>

        <TabsContent value="hub">
          <div className="lv-stack-16">
            {session ? (
              <>
                <Field label="Hub address" htmlFor="rc-hub" help="For example lunchvoice.com/beta-squad">
                  <Input id="rc-hub" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="lunchvoice.com/their-hub" autoComplete="off" spellCheck={false} />
                </Field>
                <div className="ui-row"><Button variant="primary" disabled={slug.length < 3} onClick={() => setOpen(true)} data-testid="rc-hub-continue">Continue</Button></div>
              </>
            ) : (
              <Notice>Sign in to report a Hub, so we can follow up with you. <Link className="lv-inline-link" to="/signin" state={{ from: "/support" }}>Sign in</Link></Notice>
            )}
          </div>
        </TabsContent>

        <TabsContent value="survey">
          <div className="lv-stack-16">
            <p className="lv-m0">Open the survey and use <em>Report this survey</em> at the bottom. You don’t need an account.</p>
            <Field label="Survey code" htmlFor="rc-code" help="The six-character code, for example K7P2QX">
              <Input id="rc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="K7P2QX" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </Field>
            <div className="ui-row"><LinkButton to={cleanCode ? `/c/${encodeURIComponent(cleanCode)}` : "/join"} variant="primary">Open the survey</LinkButton></div>
          </div>
        </TabsContent>
      </Tabs>

      {session && mine.data && mine.data.reports.length > 0 && (
        <div className="lv-stack-8" data-testid="my-reports">
          <h3 className="lv-qw-h">Your reports</h3>
          <ul className="lv-my-reports">
            {mine.data.reports.map((r) => (
              <li key={r.report_id}>
                <span><strong>{r.label}</strong> <span className="ui-muted">· {reasonLabel(r.reason)}</span></span>
                <Badge variant={r.status === "open" ? "neutral" : r.status === "actioned" ? "ok" : "outline"}>{r.status === "open" ? "With staff" : r.status === "actioned" ? "Action taken" : "Reviewed"}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        title={`Report lunchvoice.com/${slug}`}
        description="LunchVoice staff review it and can act on the Hub. Its owner is never told who reported it."
        onSend={async (reason, details) => {
          const r = await api.reportHub(slug, reason, details);
          if (!r.ok) return describeError(r.error);
          toast.success(r.duplicate ? "You’ve already reported this Hub. Staff will review it." : "Report sent to LunchVoice staff");
          setAddress("");
          mine.reload();
          return null;
        }}
      />
    </Card>
  );
}
