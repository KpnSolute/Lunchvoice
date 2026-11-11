import { useState } from "react";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import { Button } from "@/components/shadcn/button";
import { Textarea } from "@/components/shadcn/textarea";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import { Field, Notice, Segmented } from "@/components/shadcn/blocks";

// The values are the database categories (000030), so staff can sort and filter by them.
const REASONS = [
  { value: "harmful", label: "Harmful or abusive" },
  { value: "scam", label: "Scam or phishing" },
  { value: "private_info", label: "Asks for private information" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;

/** "Report this survey" on every respondent screen (founder decision 6). Works signed out. */
export function ReportSurvey({ joinCode }: { joinCode: string }) {
  const { api } = useIdentity();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof REASONS)[number]["value"]>("harmful");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const label = REASONS.find((r) => r.value === kind)!.label;
    const r = await api.reportAbuse(joinCode, detail.trim() || label, kind);
    setBusy(false);
    if (!r.ok) return setError(describeError(r.error));
    setOpen(false);
    setDetail("");
    toast.success("Thanks. We’ll review this survey.");
  }

  return (
    <div className="lv-report">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="quiet" size="sm">Report this survey</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this survey</DialogTitle>
            <DialogDescription>Tell us what’s wrong. Reports go to LunchVoice, not to the person who made the survey.</DialogDescription>
          </DialogHeader>
          <Segmented label="Reason" value={kind} onValueChange={setKind} options={REASONS.map((r) => ({ value: r.value, label: r.label }))} />
          <Field label="Details (optional)" htmlFor="report-detail" counter={{ value: detail.length, max: 400 }}>
            <Textarea id="report-detail" value={detail} maxLength={400} onChange={(e) => setDetail(e.target.value)} />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button variant="ink" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
