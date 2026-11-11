import { useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { RadioGroup } from "@/components/shadcn/radio-group";
import { Textarea } from "@/components/shadcn/textarea";
import { Field, Notice } from "@/components/shadcn/blocks";
import { REPORT_REASONS, type ReportReason } from "../lib/reports";

/**
 * One report dialog for a person or a Hub: pick a reason, add details if you want, send. The parent decides where the
 * report goes. The reported person is never told who reported them, and the dialog says so.
 */
export function ReportDialog({
  open,
  onOpenChange,
  title,
  description,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Resolves with null on success, or a message to show. */
  onSend: (reason: ReportReason, details: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setReason(""); setDetails(""); setError(null); } }, [open]);
  async function send() {
    if (!reason || busy) return;
    setBusy(true);
    const msg = await onSend(reason, details.trim());
    setBusy(false);
    if (msg) setError(msg); else onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <fieldset className="lv-fieldset">
          <legend className="lv-legend">What’s going on?</legend>
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)} aria-label="Reason" className="lv-report-reasons">
            {REPORT_REASONS.map((r) => (
              <label key={r.key} className="lv-report-reason" data-checked={reason === r.key || undefined}>
                <input type="radio" name="report-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} />
                <span><strong>{r.label}</strong><small>{r.help}</small></span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
        <Field label="Anything we should know? (optional)" htmlFor="report-details" counter={{ value: details.length, max: 1000 }}>
          <Textarea id="report-details" value={details} maxLength={1000} rows={3} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <p className="ui-help lv-m0">LunchVoice staff read every report. The person you report is never told who reported them.</p>
        <div className="ui-row">
          <Button variant="primary" disabled={!reason || busy} onClick={() => void send()} data-testid="report-send">{busy ? "Sending…" : "Send report"}</Button>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
