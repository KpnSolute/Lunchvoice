import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError, describeGate } from "../lib/errors";
import type { CampaignDetailData, CampaignInvite, Question, QuestionKind } from "../lib/lvApi";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton } from "../components/ui";
import { QuestionInput } from "../ui/QuestionControls";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Switch } from "@/components/shadcn/switch";
import { Badge } from "@/components/shadcn/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";
import { CopyField, Eyebrow, Field, LoadingRows, Notice, PhaseBadge, QuotaMeter, Segmented, ToggleRow } from "@/components/shadcn/blocks";
import { QrCode } from "@/components/shadcn/blocks/qr";

/**
 * Campaign Studio. The same editor serves Hub Campaigns and Quick Surveys (the personal space): Quick Surveys add the
 * 10-question limit, link-or-invite access and invite links. Every rule is enforced by the backend; the UI explains.
 */

export const KINDS: { key: QuestionKind; label: string }[] = [
  { key: "rating", label: "Rating 1–5" },
  { key: "single_choice", label: "Single choice" },
  { key: "multi_choice", label: "Multiple choice" },
  { key: "yes_no", label: "Yes / No" },
  { key: "text", label: "Short text" },
];
const TEXT_WARNING = "Text answers can identify people. We only show them once enough people have answered.";
const hasOptions = (k: QuestionKind) => k === "single_choice" || k === "multi_choice";
const splitOptions = (s: string) => s.split("\n").map((o) => o.trim()).filter(Boolean);
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

type Pane = "outline" | "edit" | "share";

export function StudioView({
  campaignId,
  backTo,
  crumb,
  resultsTo,
  quick,
  shareBase = "https://lunchvoice.com",
}: {
  campaignId: string;
  backTo: string;
  crumb: string;
  resultsTo: string;
  /** Set for Quick Surveys: the personal-space limits from lv_my_context / lv_quick_survey_list. */
  quick?: { questionLimit: number | null; active: number; activeLimit: number | null };
  shareBase?: string;
}) {
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(campaignId), [api, campaignId]);
  const [sel, setSel] = useState<string>("new");
  const [pane, setPane] = useState<Pane>("outline");
  const [error, setError] = useState<string | null>(null);
  const d = detail.data;

  if (detail.loading && !d) return <LoadingRows rows={4} label="Loading the Studio" />;
  if (detail.error) return <Notice tone="error">{describeError(detail.error)}</Notice>;
  if (!d) return null;

  const phase = campaignPhase(d.campaign);
  const draft = d.campaign.status === "draft";
  const personal = Boolean(quick) || d.campaign.space === "personal";
  const limit = quick?.questionLimit ?? d.campaign.question_limit ?? null;
  const atLimit = limit !== null && d.questions.length >= limit;
  const current = d.questions.find((q) => q.question_id === sel) ?? null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>, done?: string) => {
    setError(null);
    const r = await fn();
    if (r.ok) {
      if (done) toast.success(done);
      detail.reload();
      return true;
    }
    setError(describeError(r.error as never));
    return false;
  };

  return (
    <div className="lv-studio" data-pane={pane}>
      <div className="lv-studio-top">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link to={backTo}><Icon name="back" size={18} /></Link>
        </Button>
        <div className="lv-studio-title">
          <span className="lv-row-sub">{crumb}</span>
          <TitleEditor d={d} onSave={(title) => run(() => api.campaignUpdate(campaignId, { title }), "Title saved")} />
        </div>
        <PhaseBadge phase={phase} />
        <div className="lv-studio-actions">
          {draft && <PublishDialog d={d} onDone={() => detail.reload()} />}
          {d.campaign.status === "active" && <Button variant="secondary" onClick={() => run(() => api.campaignPause(campaignId), "Paused")}>Pause</Button>}
          {d.campaign.status === "paused" && <Button variant="ink" onClick={() => run(() => api.campaignResume(campaignId), "Resumed")}>Resume</Button>}
          {(d.campaign.status === "active" || d.campaign.status === "paused") && (
            <ConfirmAction
              trigger={<Button variant="secondary">Close</Button>}
              title="Close this survey?"
              body="Nobody can answer after it closes. Results stay, and anonymous results become visible once it’s closed."
              action="Close survey"
              onConfirm={() => run(() => api.campaignClose(campaignId), "Closed")}
            />
          )}
          {personal && (d.campaign.status === "active" || d.campaign.status === "paused") && (
            <ConfirmAction
              trigger={<Button variant="quiet">Archive</Button>}
              title="Close and archive this survey?"
              body="Nobody can answer after this. It leaves your list and frees one of your active Quick Survey slots. Results are kept."
              action="Close and archive"
              onConfirm={() => run(async () => { const c = await api.campaignClose(campaignId); return c.ok ? api.campaignArchive(campaignId) : c; }, "Archived. One slot is free again.")}
            />
          )}
          {d.campaign.status === "closed" && (
            <ConfirmAction
              trigger={<Button variant="quiet">Archive</Button>}
              title="Archive this survey?"
              body="It leaves your lists. Its results are kept."
              action="Archive"
              onConfirm={() => run(() => api.campaignArchive(campaignId), "Archived")}
            />
          )}
          {!draft && <LinkButton to={resultsTo} variant="secondary" icon="voice">Results</LinkButton>}
        </div>
      </div>

      <div className="lv-pane-switch">
        <Segmented<Pane>
          label="Studio panes"
          value={pane}
          onValueChange={setPane}
          options={[{ value: "outline", label: "Outline" }, { value: "edit", label: "Edit" }, { value: "share", label: draft ? "Settings" : "Share" }]}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!draft && <Notice>Published surveys can’t change their questions. Close it to stop answers.</Notice>}
      {quick && draft && quick.activeLimit !== null && quick.active >= quick.activeLimit && (
        <Notice tone="warn" title={`${quick.active} of ${quick.activeLimit} Quick Surveys are active`}>Publishing needs a free slot. Close or archive an active survey first.</Notice>
      )}

      <div className="lv-studio-grid">
        <section className="lv-pane lv-pane-outline" aria-label="Questions">
          <div className="ui-spread">
            <Eyebrow>Questions · {d.questions.length}{limit !== null ? ` of ${limit}` : ""}</Eyebrow>
          </div>
          {limit !== null && <QuotaMeter label="Questions" used={d.questions.length} limit={limit} />}
          <ol className="lv-outline">
            {d.questions.map((q, i) => (
              <li key={q.question_id} className="lv-outline-li">
                <button type="button" className="lv-outline-item" aria-current={sel === q.question_id ? "true" : undefined} onClick={() => { setSel(q.question_id); setPane("edit"); }}>
                  <span className="lv-outline-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="lv-outline-text"><span>{q.prompt}</span><small>{KINDS.find((k) => k.key === q.kind)?.label ?? q.kind}</small></span>
                </button>
                {draft && (
                  <span className="lv-outline-move">
                    <Button variant="quiet" size="icon-sm" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => run(() => api.questionUpdate(q.question_id, { position: i - 1 }))}><Icon name="chevron" size={14} className="lv-rot180" /></Button>
                    <Button variant="quiet" size="icon-sm" aria-label={`Move question ${i + 1} down`} disabled={i === d.questions.length - 1} onClick={() => run(() => api.questionUpdate(q.question_id, { position: i + 1 }))}><Icon name="chevron" size={14} /></Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {draft && (
            <button type="button" className="lv-add" aria-current={sel === "new" ? "true" : undefined} disabled={atLimit} onClick={() => { setSel("new"); setPane("edit"); }}>
              <Icon name="plus" size={16} /> {atLimit ? `Limit of ${limit} questions reached` : "Add question"}
            </button>
          )}
        </section>

        <section className="lv-pane lv-pane-edit" aria-label="Editor">
          {current ? (
            <QuestionEditor key={current.question_id} q={current} index={d.questions.indexOf(current)} locked={!draft}
              onSave={(patch) => run(() => api.questionUpdate(current.question_id, patch), "Saved")}
              onRemove={async () => { if (await run(() => api.questionRemove(current.question_id), "Question removed")) setSel("new"); }} />
          ) : draft ? (
            <NewQuestion disabled={atLimit} limit={limit} onAdd={async (kind, prompt, config) => {
              const r = await api.questionAdd(campaignId, d.questions.length, kind, prompt, config);
              if (!r.ok) { setError(describeError(r.error)); return false; }
              detail.reload();
              setSel(r.question_id);
              return true;
            }} />
          ) : (
            <Card variant="well"><p className="lv-m0">Pick a question on the left to see how it looks.</p></Card>
          )}
        </section>

        <aside className="lv-pane lv-pane-share" aria-label={draft ? "Settings" : "Share"}>
          {quick && (
            <Card>
              <h2 className="lv-share-h">Your free slots</h2>
              <QuotaMeter label="Active Quick Surveys" used={quick.active} limit={quick.activeLimit} hint="Archiving a survey frees a slot." />
            </Card>
          )}
          <ParticipationCard d={d} personal={personal} onChange={() => detail.reload()} setError={setError} />
          {!draft && <ShareCard d={d} shareBase={shareBase} />}
          {personal && d.campaign.access === "invite" && <InvitesCard campaignId={campaignId} shareBase={shareBase} disabled={draft} />}
        </aside>
      </div>
    </div>
  );
}

function TitleEditor({ d, onSave }: { d: CampaignDetailData; onSave: (t: string) => Promise<boolean> }) {
  const [t, setT] = useState(d.campaign.title);
  useEffect(() => setT(d.campaign.title), [d.campaign.title]);
  if (d.campaign.status !== "draft") return <h1>{d.campaign.title}</h1>;
  return (
    <h1>
      <input
        className="lv-title-input"
        data-slot="title-input"
        aria-label="Title"
        value={t}
        maxLength={120}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => { if (t.trim() && t.trim() !== d.campaign.title) void onSave(t.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </h1>
  );
}

function QuestionEditor({ q, index, locked, onSave, onRemove }: { q: Question; index: number; locked: boolean; onSave: (p: { prompt?: string; config?: object }) => Promise<boolean>; onRemove: () => void }) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [options, setOptions] = useState((q.config.options ?? []).join("\n"));
  const [preview, setPreview] = useState<unknown>(undefined);
  const dirty = prompt.trim() !== q.prompt || (hasOptions(q.kind) && JSON.stringify(splitOptions(options)) !== JSON.stringify(q.config.options ?? []));
  return (
    <>
      <Card>
        <div className="ui-spread">
          <Eyebrow>Question {String(index + 1).padStart(2, "0")}</Eyebrow>
          <Badge>{KINDS.find((k) => k.key === q.kind)?.label ?? q.kind}</Badge>
        </div>
        <Field label="Question" htmlFor="e-prompt" counter={{ value: prompt.length, max: 200 }}>
          <Input id="e-prompt" value={prompt} maxLength={200} disabled={locked} onChange={(e) => setPrompt(e.target.value)} />
        </Field>
        {hasOptions(q.kind) && (
          <Field label="Options, one per line" htmlFor="e-options" help="2 to 10 options.">
            <Textarea id="e-options" value={options} disabled={locked} onChange={(e) => setOptions(e.target.value)} />
          </Field>
        )}
        {q.kind === "text" && <Notice tone="warn">{TEXT_WARNING}</Notice>}
        {!locked && (
          <div className="ui-row">
            <Button variant="ink" disabled={!dirty || !prompt.trim()} onClick={() => onSave({ prompt: prompt.trim(), ...(hasOptions(q.kind) ? { config: { ...q.config, options: splitOptions(options) } } : {}) })}>Save question</Button>
            <ConfirmAction trigger={<Button variant="quiet">Remove</Button>} title="Remove this question?" body="It’s a draft, so nobody has answered it yet." action="Remove" onConfirm={async () => { onRemove(); return true; }} />
          </div>
        )}
      </Card>
      <Card variant="well">
        <Eyebrow>Respondent preview</Eyebrow>
        <h2 className="lv-q-title lv-q-title-preview">{prompt || "Your question"}</h2>
        <QuestionInput q={{ ...q, prompt, config: { ...q.config, options: splitOptions(options) } }} value={preview} onChange={setPreview} />
      </Card>
    </>
  );
}

function NewQuestion({ disabled, limit, onAdd }: { disabled: boolean; limit: number | null; onAdd: (k: QuestionKind, prompt: string, config: object) => Promise<boolean> }) {
  const [kind, setKind] = useState<QuestionKind>("rating");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);
  const opts = splitOptions(options);
  const valid = prompt.trim() && (!hasOptions(kind) || (opts.length >= 2 && opts.length <= 10));
  return (
    <Card>
      <Eyebrow accent>Add a question</Eyebrow>
      {disabled && <Notice tone="warn">Quick Surveys have up to {limit} questions. Remove one to add another.</Notice>}
      <form className="lv-stack-16" onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        const ok = await onAdd(kind, prompt.trim(), hasOptions(kind) ? { options: opts } : {});
        setBusy(false);
        if (ok) { setPrompt(""); setOptions(""); toast.success("Question added"); }
      }}>
        <Field label="Kind" htmlFor="q-kind">
          <Select value={kind} onValueChange={(v) => setKind(v as QuestionKind)} disabled={disabled}>
            <SelectTrigger id="q-kind"><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Question" htmlFor="q-prompt" counter={{ value: prompt.length, max: 200 }}>
          <Input id="q-prompt" value={prompt} maxLength={200} disabled={disabled} onChange={(e) => setPrompt(e.target.value)} placeholder="How was the long run this week?" />
        </Field>
        {hasOptions(kind) && (
          <Field label="Options, one per line" htmlFor="q-options" help="2 to 10 options." error={options && opts.length < 2 ? "Add at least two options." : undefined}>
            <Textarea id="q-options" value={options} disabled={disabled} onChange={(e) => setOptions(e.target.value)} placeholder={"Tuesday\nThursday\nSaturday"} />
          </Field>
        )}
        {kind === "text" && <Notice tone="warn">{TEXT_WARNING}</Notice>}
        <p className="ui-help lv-m0">Every question needs an answer. The kind is fixed once a question exists.</p>
        <div className="ui-row"><Button type="submit" variant="ink" disabled={disabled || !valid || busy}><Icon name="plus" size={16} />{busy ? "Adding…" : "Add question"}</Button></div>
      </form>
    </Card>
  );
}

function ParticipationCard({ d, personal, onChange, setError }: { d: CampaignDetailData; personal: boolean; onChange: () => void; setError: (e: string | null) => void }) {
  const { api } = useIdentity();
  const draft = d.campaign.status === "draft";
  const invite = d.campaign.access === "invite";
  const guests = d.campaign.audience === "members_and_guests";
  return (
    <Card>
      <h2 className="lv-share-h">Who can answer</h2>
      <ul className="lv-facts">
        {personal && <li><span>Access</span><strong>{invite ? "Invite only" : "Anyone with the link"}</strong></li>}
        <li><span>Answers</span><strong>{d.campaign.anonymity === "anonymous" ? "Anonymous" : "Identified"}</strong></li>
      </ul>
      <ToggleRow
        title="Allow guests"
        description={invite ? "Invite-only surveys need sign-in, so guests can’t answer." : "Guests answer without an account and never count as members."}
        control={
          <Switch
            aria-label="Allow guests"
            checked={guests}
            disabled={!draft || invite}
            onCheckedChange={async (on) => {
              setError(null);
              const r = await api.setParticipation(d.campaign.campaign_id, on ? "members_and_guests" : "members");
              if (r.ok) onChange(); else setError(describeError(r.error));
            }}
          />
        }
      />
      {!draft && <p className="ui-help lv-m0">Who can answer is part of the published version and can’t change now.</p>}
    </Card>
  );
}

function ShareCard({ d, shareBase }: { d: CampaignDetailData; shareBase: string }) {
  const open = d.campaign.audience === "members_and_guests" && d.join_code;
  return (
    <Card>
      <h2 className="lv-share-h">Share</h2>
      {open ? (
        <>
          <CopyField label="Direct link" value={`${shareBase}/c/${d.join_code}`} />
          <QrCode value={`${shareBase}/c/${d.join_code}`} label={`QR code for ${d.campaign.title}`} size={180} />
          <ul className="lv-facts"><li><span>Join code</span><strong className="lv-code">{d.join_code}</strong></li></ul>
          <p className="ui-help lv-m0">Anyone with the link, QR or code can answer. It’s never listed publicly.</p>
        </>
      ) : d.campaign.access === "invite" ? (
        <p className="ui-muted lv-m0">Invite only: send the invite links below. Each person signs in to answer.</p>
      ) : (
        <p className="ui-muted lv-m0">Members answer from the Hub’s Campaigns page. Turn on guests before publishing to get a public link and code.</p>
      )}
    </Card>
  );
}

function InvitesCard({ campaignId, shareBase, disabled }: { campaignId: string; shareBase: string; disabled: boolean }) {
  const { api } = useIdentity();
  const list = useLv(() => api.campaignInviteList(campaignId), [api, campaignId]);
  const [maxUses, setMaxUses] = useState("");
  const [fresh, setFresh] = useState<CampaignInvite | null>(null);
  async function create() {
    const r = await api.campaignInviteCreate(campaignId, maxUses ? Number(maxUses) : null);
    if (!r.ok) return toast.error(describeError(r.error));
    setFresh(r.invite);
    list.reload();
  }
  return (
    <Card>
      <h2 className="lv-share-h">Invite links</h2>
      <p className="ui-muted lv-m0">Each link lets signed-in people answer this survey only.</p>
      <div className="lv-invite-form">
        <Field label="Max uses" htmlFor="ci-max" help="Leave empty for no limit.">
          <Input id="ci-max" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="No limit" aria-describedby="ci-max-help" />
        </Field>
        <Button variant="ink" onClick={create}><Icon name="plus" size={16} />Create link</Button>
      </div>
      {disabled && <p className="ui-help lv-m0">Links work once the survey is published.</p>}
      {fresh && <CopyField label="New invite link" value={`${shareBase}/s/${fresh.token}`} />}
      {(list.data?.invites.length ?? 0) > 0 && (
        <ul className="lv-facts">
          {list.data!.invites.map((i) => (
            <li key={i.token}>
              <span className="ui-mono">…{i.token.slice(-6)} · {i.uses}{i.max_uses ? `/${i.max_uses}` : ""} used</span>
              <Button variant="quiet" size="sm" onClick={async () => { const r = await api.campaignInviteRevoke(i.token); if (r.ok) { toast.success("Link revoked"); list.reload(); } }}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PublishDialog({ d, onDone }: { d: CampaignDetailData; onDone: () => void }) {
  const { api } = useIdentity();
  const [open, setOpen] = useState(false);
  const [opens, setOpens] = useState(toLocalInput(d.campaign.opens_at));
  const [closes, setCloses] = useState(toLocalInput(d.campaign.closes_at));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string[] | null>(null);
  const badWindow = Boolean(opens && closes && new Date(closes) <= new Date(opens));

  async function publish() {
    setBusy(true);
    setProblem(null);
    const scheduled = Boolean(opens || closes);
    const r = scheduled
      ? await api.schedule(d.campaign.campaign_id, opens ? new Date(opens).toISOString() : null, closes ? new Date(closes).toISOString() : null)
      : await api.campaignActivate(d.campaign.campaign_id);
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      toast.success(scheduled && opens ? "Scheduled" : "Published", { description: "Share the link, code or invite links." });
      onDone();
      return;
    }
    setProblem(r.error.code === "lv_gate_blocked" ? describeGate(r.error.reasons ?? [r.error.message]) : [describeError(r.error)]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary">Publish</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish “{d.campaign.title}”?</DialogTitle>
          <DialogDescription>Questions lock once it’s published. Leave the dates empty to open it now and close it yourself.</DialogDescription>
        </DialogHeader>
        <div className="ui-grid-2">
          <Field label="Opens (optional)" htmlFor="p-opens"><Input id="p-opens" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} /></Field>
          <Field label="Closes (optional)" htmlFor="p-closes" error={badWindow ? "Closing must be after opening." : undefined}><Input id="p-closes" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
        </div>
        {d.questions.length === 0 && <Notice tone="warn">Add at least one question first.</Notice>}
        {problem && <Notice tone="error" title="Can’t publish yet">{problem.join(" ")}</Notice>}
        <DialogFooter>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="primary" onClick={publish} disabled={busy || badWindow || d.questions.length === 0}>{busy ? "Publishing…" : opens ? "Schedule" : "Publish now"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmAction({ trigger, title, body, action, onConfirm }: { trigger: React.ReactNode; title: string; body: string; action: string; onConfirm: () => Promise<boolean> | boolean }) {
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
