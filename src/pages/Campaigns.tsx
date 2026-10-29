import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { PENDING_API, type CampaignMode, type CampaignRow, type QuestionKind } from "../lib/lvApi";
import { describeError, describeGate } from "../lib/errors";
import {
  AnswerControl,
  Bars,
  Button,
  ButtonLink,
  Card,
  CodeDisplay,
  CopyField,
  Dialog,
  DistributionColumns,
  Empty,
  ErrorNote,
  Field,
  Icon,
  IconToggleGroup,
  Lifecycle,
  Loading,
  Metric,
  Notice,
  PageHead,
  PendingNote,
  Pill,
  RadioGroup,
  Segmented,
  Select,
  StackedParticipation,
  Table,
  TextInput,
  Textarea,
  TrendLine,
  dailyTrend,
  shortDay,
  useToast,
} from "../ui";
import { can, useHubCtx } from "./Hub";

/* ------------------------------------------------------------------ list */

const PHASES = ["all", "active", "draft", "closed"] as const;

export function Campaigns() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const [phase, setPhase] = useState<(typeof PHASES)[number]>("all");
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);

  const rows = useMemo(() => {
    const all = list.data?.campaigns ?? [];
    return phase === "all" ? all : all.filter((c) => c.status === phase);
  }, [list.data, phase]);

  const counts = useMemo(() => {
    const all = list.data?.campaigns ?? [];
    return {
      all: all.length,
      active: all.filter((c) => c.status === "active").length,
      draft: all.filter((c) => c.status === "draft").length,
      closed: all.filter((c) => c.status === "closed").length,
    };
  }, [list.data]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead
        eyebrow="Campaigns"
        title="Every ask in one place."
        sub="A Campaign is a survey, poll, rating, idea or election. Drafts are invisible to members until you publish."
        action={
          can(membership, "campaign.manage") ? (
            <ButtonLink to={`/${hub.slug}/campaigns/new`} variant="primary" icon="plus">
              New Campaign
            </ButtonLink>
          ) : undefined
        }
      />

      <Segmented
        label="Filter by phase"
        value={phase}
        onChange={(k) => setPhase(k as (typeof PHASES)[number])}
        items={PHASES.map((p) => ({ key: p, label: p === "all" ? "All" : p[0].toUpperCase() + p.slice(1), count: counts[p] }))}
      />

      {list.loading && <Loading rows={3} />}
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}

      {list.data && rows.length === 0 && (
        <Empty
          icon="campaign"
          title={phase === "all" ? "No Campaigns yet" : `No ${phase} Campaigns`}
          action={
            can(membership, "campaign.manage") ? (
              <ButtonLink to={`/${hub.slug}/campaigns/new`} variant="primary" size="sm">
                Create a Campaign
              </ButtonLink>
            ) : undefined
          }
        >
          Start with a survey if you need detail, a poll if you need a quick read, or a rating if you are comparing options.
        </Empty>
      )}

      <div className="grid grid-2">
        {rows.map((c) => (
          <CampaignCard key={c.campaign_id} campaign={c} hubSlug={hub.slug} />
        ))}
      </div>
    </div>
  );
}

function CampaignCard({ campaign, hubSlug }: { campaign: CampaignRow; hubSlug: string }) {
  return (
    <Card className="stack">
      <div className="row-between">
        <div className="stack stack-sm" style={{ minWidth: 0 }}>
          <p className="t-title">{campaign.title}</p>
          <p className="t-small subtle">
            {campaign.mode} · {campaign.question_count} {campaign.question_count === 1 ? "question" : "questions"} ·{" "}
            {campaign.anonymity}
          </p>
        </div>
        <Pill tone={campaign.status === "active" ? "ok" : campaign.status === "draft" ? "quiet" : "quiet"}>{campaign.status}</Pill>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {campaign.join_code && <Pill tone="quiet">Code {campaign.join_code}</Pill>}
        {campaign.has_responded && <Pill tone="accent">You answered</Pill>}
      </div>
      <div className="row">
        <ButtonLink to={`/${hubSlug}/campaigns/${campaign.campaign_id}`} variant="raised" size="sm">
          Open
        </ButtonLink>
        <ButtonLink to={`/${hubSlug}/campaigns/${campaign.campaign_id}/results`} variant="quiet" size="sm">
          Results
        </ButtonLink>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ new */

const MODES: { mode: CampaignMode; title: string; body: string; icon: "campaign" | "leaderboard" | "star" | "comments" }[] = [
  { mode: "survey", title: "Survey", body: "Several questions, the most detailed picture. Limited per plan.", icon: "campaign" },
  { mode: "poll", title: "Poll", body: "One question, one answer. Fast to run, easy to answer.", icon: "leaderboard" },
  { mode: "rating", title: "Rating", body: "Rate options from 1 to 5. Good for comparing a shortlist.", icon: "star" },
  { mode: "feedback", title: "Ideas and feedback", body: "Open answers, with a prompt that invites specifics.", icon: "comments" },
];

export function NewCampaign() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<CampaignMode>("poll");
  const [title, setTitle] = useState("");
  const [anonymity, setAnonymity] = useState("anonymous");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await api.campaignCreate(hub.hub_id, title.trim(), mode, anonymity === "anonymous" ? "anonymous" : "identified");
    setBusy(false);
    if (r.ok && typeof r === "object" && "campaign_id" in r) {
      toast("Draft created", "ok");
      navigate(`/${hub.slug}/campaigns/${r.campaign_id}/studio`);
    } else {
      toast("Could not create the Campaign", "error");
    }
  }

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <PageHead eyebrow="New Campaign" title="Pick a shape." sub="Choose the mode first. You can change the questions, not the mode." back={{ to: `/${hub.slug}/campaigns`, label: "Campaigns" }} />

      <div className="grid grid-2" role="radiogroup" aria-label="Campaign mode">
        {MODES.map((m) => {
          const on = mode === m.mode;
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={on}
              className="s-card card press"
              style={{
                textAlign: "left",
                cursor: "pointer",
                border: on ? "2px solid var(--lv-text)" : "0",
                background: on ? "var(--lv-surface)" : undefined,
              }}
              onClick={() => setMode(m.mode)}
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="s-well" style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 14 }}>
                  <Icon name={m.icon} size={20} />
                </span>
                {on && <Pill tone="accent">Selected</Pill>}
              </div>
              <p className="t-title" style={{ marginTop: 12 }}>{m.title}</p>
              <p className="t-small muted">{m.body}</p>
            </button>
          );
        })}
      </div>

      <Card className="stack">
        <Field label="Campaign title" htmlFor="c-title" help="Members see this first. Say what you are asking, not what you are running.">
          <TextInput id="c-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Which session should we add on Saturdays?" />
        </Field>
        <RadioGroup
          label="Answers"
          value={anonymity}
          onChange={setAnonymity}
          options={[
            { value: "anonymous", label: "Anonymous", hint: "You see counts, never who said what. Results appear after the Campaign closes." },
            { value: "identified", label: "Signed answers", hint: "Responses are attributed to members. Use only when you need to follow up." },
          ]}
        />
        <div className="row row-end">
          <Button variant="primary" disabled={title.trim().length < 3} loading={busy} onClick={create}>
            Create draft
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ studio */

const KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: "rating", label: "Rating 1–5" },
  { kind: "single_choice", label: "Single choice" },
  { kind: "multi_choice", label: "Multi choice" },
  { kind: "yes_no", label: "Yes / no" },
  { kind: "text", label: "Open text" },
];

export function Studio() {
  const { hub } = useHubCtx();
  const { id = "" } = useParams();
  const { api } = useIdentity();
  const toast = useToast();
  const q = useLv(() => api.campaignGet(id), [api, id]);
  const [tab, setTab] = useState("build");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<QuestionKind>("rating");
  const [options, setOptions] = useState("Option one\nOption two\nOption three");
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  const campaign = q.data?.campaign;
  const questions = q.data?.questions ?? [];
  const gate = q.data?.gate;

  const addQuestion = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    const config =
      kind === "single_choice" || kind === "multi_choice"
        ? { options: options.split("\n").map((s) => s.trim()).filter(Boolean) }
        : {};
    const r = await api.questionAdd(id, questions.length, kind, prompt.trim(), config);
    setBusy(false);
    if (r.ok) {
      setPrompt("");
      toast("Question added", "ok");
      q.reload();
    } else toast(describeError(r.error), "error");
  };

  const reorder = async (from: number, to: number) => {
    if (to < 0 || to >= questions.length || from === to) return;
    const a = questions[from];
    const b = questions[to];
    await Promise.all([api.questionUpdate(a.question_id, { position: to }), api.questionUpdate(b.question_id, { position: from })]);
    q.reload();
  };

  if (q.loading) return <Loading rows={4} label="Loading Campaign" />;
  if (q.error || !campaign) return <ErrorNote error={q.error} onRetry={q.reload} />;

  const editable = campaign.status === "draft";

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHead
        eyebrow={`${campaign.mode} · ${campaign.status}`}
        title={campaign.title}
        sub="Build the questions, choose who can answer, then publish. Nothing is visible to members until you publish."
        back={{ to: `/${hub.slug}/campaigns/${id}`, label: campaign.title }}
        action={
          <>
            <ButtonLink to={`/${hub.slug}/campaigns/${id}/results`} variant="raised" size="sm">
              Results
            </ButtonLink>
            <Button variant="primary" size="sm" disabled={!editable} onClick={() => setPublishOpen(true)}>
              Publish
            </Button>
          </>
        }
      />

      <Segmented
        label="Studio sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: "build", label: "Questions" },
          { key: "audience", label: "Audience" },
          { key: "schedule", label: "Schedule" },
          { key: "share", label: "Share" },
          { key: "preview", label: "Preview" },
        ]}
      />

      <div className="studio-grid">
        <div className="stack" style={{ gap: 16 }}>
          {tab === "build" && (
            <>
              {!editable && (
                <Notice tone="info" title="This Campaign is published">
                  Questions are locked. Duplicate the Campaign to run a revised version; answers already collected stay untouched.
                </Notice>
              )}

              <Card className="stack">
                <div className="row-between">
                  <h2 className="t-title">Questions</h2>
                  <Pill>{questions.length}</Pill>
                </div>
                {questions.length === 0 && (
                  <Empty icon="builder" title="No questions yet">Add one below. A Campaign cannot be published with zero questions.</Empty>
                )}
                <ol className="stack stack-sm">
                  {questions.map((qq, i) => (
                    <li
                      key={qq.question_id}
                      className="s-raised row"
                      style={{ padding: 12, borderRadius: 16, gap: 12, alignItems: "flex-start" }}
                      draggable={editable}
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null) void reorder(dragIndex, i);
                        setDragIndex(null);
                      }}
                    >
                      <span
                        className="choice-key"
                        aria-hidden="true"
                        style={{ cursor: editable ? "grab" : "default" }}
                        title="Drag to reorder"
                      >
                        {i + 1}
                      </span>
                      <div className="stack stack-sm grow">
                        <span className="t-ui" style={{ fontWeight: 600 }}>{qq.prompt}</span>
                        <span className="t-small subtle">
                          {KINDS.find((k) => k.kind === qq.kind)?.label ?? qq.kind}
                          {Array.isArray((qq.config as { options?: string[] }).options)
                            ? ` · ${(qq.config as { options?: string[] }).options!.join(", ")}`
                            : ""}
                        </span>
                      </div>
                      <div className="row" style={{ gap: 4 }}>
                        <IconToggleGroup
                          label={`Reorder ${qq.prompt}`}
                          items={[
                            { key: "up", icon: "chevron-left", label: "Move up" },
                            { key: "down", icon: "chevron-right", label: "Move down" },
                          ]}
                          value={[]}
                          onChange={(v) => {
                            const k = v[v.length - 1];
                            if (k === "up") void reorder(i, i - 1);
                            if (k === "down") void reorder(i, i + 1);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="quiet"
                          aria-label={`Remove ${qq.prompt}`}
                          disabled={!editable}
                          onClick={async () => {
                            const r = await api.questionRemove(qq.question_id);
                            toast(r.ok ? "Question removed" : "Could not remove", r.ok ? "ok" : "error");
                            q.reload();
                          }}
                        >
                          <Icon name="trash" size={16} title="Remove" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
                {editable && questions.length > 0 && (
                  <p className="t-small subtle">Drag a question, or use its arrows. Arrow buttons work with a keyboard too.</p>
                )}
              </Card>

              <Card className="stack" style={{ opacity: editable ? 1 : 0.6 }}>
                <h2 className="t-title">Add a question</h2>
                <Field label="Question" htmlFor="q-prompt">
                  <TextInput
                    id="q-prompt"
                    value={prompt}
                    disabled={!editable}
                    maxLength={160}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="How was the Saturday session?"
                  />
                </Field>
                <Field label="Answer type" htmlFor="q-kind">
                  <Select
                    id="q-kind"
                    label="Answer type"
                    value={kind}
                    onChange={(v) => setKind(v as QuestionKind)}
                    options={KINDS.map((k) => ({ value: k.kind, label: k.label }))}
                  />
                </Field>
                {(kind === "single_choice" || kind === "multi_choice") && (
                  <Field label="Options" htmlFor="q-options" help="One per line. Two to eight options works best.">
                    <Textarea id="q-options" value={options} disabled={!editable} onChange={(e) => setOptions(e.target.value)} style={{ minHeight: 96 }} />
                  </Field>
                )}
                <div className="row">
                  <Button variant="raised" disabled={!editable || !prompt.trim()} loading={busy} onClick={addQuestion} icon="plus">
                    Add question
                  </Button>
                </div>
              </Card>
            </>
          )}

          {tab === "audience" && <AudienceEditor id={id} editable={editable} anonymity={campaign.anonymity} onSaved={q.reload} />}

          {tab === "schedule" && <ScheduleEditor id={id} editable={editable} onSaved={q.reload} />}

          {tab === "share" && (
            <Card className="stack">
              <h2 className="t-title">Share this Campaign</h2>
              <p className="t-small muted">A join code opens the Campaign directly. No account is needed when guests are allowed.</p>
              <CodeDisplay code={q.data?.join_code ?? "------"} />
              <CopyField label="Join link" value={`${window.location.origin}/c/${q.data?.join_code ?? ""}`} />
              <div className="s-well" style={{ padding: 20, display: "grid", placeItems: "center", borderRadius: 16 }}>
                <Icon name="qr" size={64} />
                <span className="t-small subtle">QR placeholder: a real QR generator is not installed.</span>
              </div>
              <PendingNote fn="lv_campaign_poster" what="Printable poster" />
            </Card>
          )}

          {tab === "preview" && (
            <Card className="stack">
              <h2 className="t-title">Phone preview</h2>
              <p className="t-small subtle">This is the respondent player, rendered with your questions.</p>
              <div ref={previewRef}>
                <PhonePreview
                  title={campaign.title}
                  questions={questions}
                  index={Math.min(previewIndex, Math.max(0, questions.length - 1))}
                  onIndex={setPreviewIndex}
                />
              </div>
            </Card>
          )}
        </div>

        <aside className="studio-preview">
          <div className="stack stack-sm">
            <p className="t-label muted">Live preview</p>
            <PhonePreview
              title={campaign.title}
              questions={questions}
              index={Math.min(previewIndex, Math.max(0, questions.length - 1))}
              onIndex={setPreviewIndex}
            />
            <div className="row" style={{ justifyContent: "center", gap: 6 }}>
              <Button size="sm" variant="quiet" onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}>
                <Icon name="chevron-left" size={16} title="Previous question" />
              </Button>
              <span className="t-small subtle mono">
                {questions.length ? Math.min(previewIndex + 1, questions.length) : 0} / {questions.length}
              </span>
              <Button size="sm" variant="quiet" onClick={() => setPreviewIndex((i) => Math.min(questions.length - 1, i + 1))}>
                <Icon name="chevron-right" size={16} title="Next question" />
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish this Campaign?"
        footer={
          <>
            <Button variant="quiet" onClick={() => setPublishOpen(false)}>
              Not yet
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const r = await api.campaignActivate(id);
                setPublishOpen(false);
                if (r.ok) {
                  toast("Campaign published", "ok");
                  q.reload();
                } else {
                  toast(describeError(r.error), "error");
                }
              }}
            >
              Publish
            </Button>
          </>
        }
      >
        <p className="t-small muted">
          Members will see this Campaign immediately. {campaign.anonymity === "anonymous" ? "Because answers are anonymous, results stay closed until it closes." : "Results are visible to people with analytics permission."}
        </p>
        <div className="divider" />
        <p className="t-label muted">Activation gate</p>
        {gate && gate.reasons.length > 0 ? (
          <Notice tone="warn" title="Not ready to publish">
            <ul className="stack stack-sm">
              {describeGate(gate.reasons).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Notice>
        ) : (
          <Notice tone="ok" title="All gates pass">At least one question, and the Campaign is still a draft.</Notice>
        )}
      </Dialog>
      <style>{`
        .studio-grid { display: grid; gap: 20px; grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr); align-items: start; }
        .studio-preview { position: sticky; top: 80px; }
        @media (max-width: 1000px) { .studio-grid { grid-template-columns: 1fr; } .studio-preview { display: none; } }
      `}</style>
    </div>
  );
}

function PhonePreview({
  title,
  questions,
  index,
  onIndex,
}: {
  title: string;
  questions: { question_id: string; kind: string; prompt: string; config: object }[];
  index: number;
  onIndex: (i: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const current = questions[index];
  return (
    <div className="s-card" style={{ padding: 12, borderRadius: 30, maxWidth: 320, margin: "0 auto" }}>
      <div className="player" style={{ borderRadius: 22, overflow: "hidden", minHeight: 480 }}>
        <div className="player-inner" style={{ padding: 18 }}>
          <div className="player-progress">
            {questions.map((qq, i) => (
              <span key={qq.question_id} data-done={i <= index} />
            ))}
          </div>
          {current ? (
            <div className="stack">
              <p className="t-label muted">{title}</p>
              <AnswerControl
                kind={current.kind}
                prompt={current.prompt}
                config={current.config as { options?: string[] }}
                value={(answers[current.question_id] as never) ?? null}
                onChange={(v) => setAnswers((a) => ({ ...a, [current.question_id]: v }))}
              />
              <div className="row-between" style={{ marginTop: 12 }}>
                <Button size="sm" variant="quiet" disabled={index === 0} onClick={() => onIndex(index - 1)}>
                  Back
                </Button>
                <Button size="sm" variant="primary" disabled={index >= questions.length - 1} onClick={() => onIndex(index + 1)}>
                  Next
                </Button>
              </div>
              <p className="t-small subtle">Preview only. Nothing is submitted.</p>
            </div>
          ) : (
            <div className="stack">
              <p className="t-title">No questions yet</p>
              <p className="t-small muted">Add one to see it here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AudienceEditor({
  id,
  editable,
  anonymity,
  onSaved,
}: {
  id: string;
  editable: boolean;
  anonymity: string;
  onSaved: () => void;
}) {
  const { api } = useIdentity();
  const toast = useToast();
  const [anon, setAnon] = useState(anonymity);
  const [audience, setAudience] = useState("members");
  const [guests, setGuests] = useState(false);

  return (
    <Card className="stack">
      <h2 className="t-title">Audience and privacy</h2>
      <RadioGroup
        label="Who can answer"
        value={audience}
        onChange={(v) => {
          setAudience(v);
          setGuests(v === "members_and_guests");
        }}
        options={[
          { value: "members", label: "Members only", hint: "Only accepted members can answer. Guarantees one answer per person." },
          { value: "members_and_guests", label: "Members and guests", hint: "Anyone with the link can answer. Guests never count as members or toward thresholds." },
        ]}
      />
      <RadioGroup
        label="Answers"
        value={anon}
        onChange={setAnon}
        options={[
          { value: "anonymous", label: "Anonymous", hint: "Eligibility proof is stored apart from answers, so no one can resolve a respondent." },
          { value: "identified", label: "Signed", hint: "Answers carry the member. Use for follow-up, not for sensitive topics." },
        ]}
      />
      {guests && (
        <Notice tone="warn" title="Guests are excluded from thresholds">
          A guest answer is real feedback, but it is not a member. Plan thresholds and Discover eligibility count unique eligible
          members only.
        </Notice>
      )}
      <div className="row">
        <Button
          variant="primary"
          disabled={!editable}
          onClick={async () => {
            const r = await api.setParticipation(id, anon === "anonymous" ? "anonymous" : "identified", guests ? "members_and_guests" : "members");
            toast(r.ok ? "Participation saved" : describeError(r.error), r.ok ? "ok" : "error");
            onSaved();
          }}
        >
          Save audience
        </Button>
        {!editable && <span className="t-small subtle">Locked after publishing: changing anonymity later would break the promise.</span>}
      </div>
    </Card>
  );
}

function ScheduleEditor({ id, editable, onSaved }: { id: string; editable: boolean; onSaved: () => void }) {
  const { api } = useIdentity();
  const toast = useToast();
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  return (
    <Card className="stack">
      <h2 className="t-title">Schedule</h2>
      <p className="t-small muted">Leave both blank to run from publication until you close it by hand.</p>
      <div className="grid grid-2">
        <Field label="Opens" htmlFor="opens">
          <TextInput id="opens" type="datetime-local" value={opens} disabled={!editable} onChange={(e) => setOpens(e.target.value)} />
        </Field>
        <Field label="Closes" htmlFor="closes" error={opens && closes && closes <= opens ? "The close time must be after the open time." : null}>
          <TextInput id="closes" type="datetime-local" value={closes} disabled={!editable} onChange={(e) => setCloses(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Button
          variant="primary"
          disabled={!editable}
          onClick={async () => {
            const r = await api.schedule(id, opens ? new Date(opens).toISOString() : null, closes ? new Date(closes).toISOString() : null);
            toast(r.ok ? "Schedule saved" : describeError(r.error), r.ok ? "ok" : "error");
            onSaved();
          }}
        >
          Save schedule
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ detail */

export function CampaignDetail() {
  const { hub } = useHubCtx();
  const { id = "" } = useParams();
  const { api } = useIdentity();
  const toast = useToast();
  const q = useLv(() => api.campaignGet(id), [api, id]);
  const [confirm, setConfirm] = useState<null | "close" | "archive">(null);

  if (q.loading) return <Loading rows={4} label="Loading Campaign" />;
  if (q.error || !q.data) return <ErrorNote error={q.error} onRetry={q.reload} />;
  const { campaign, questions, has_responded, can_respond } = q.data;

  const act = async (fn: "close" | "archive" | "pause" | "resume") => {
    const r =
      fn === "close" ? await api.campaignClose(id) : fn === "archive" ? await api.campaignArchive(id) : fn === "pause" ? await api.campaignPause(id) : await api.campaignResume(id);
    toast(r.ok ? `Campaign ${fn}d` : describeError(r.error), r.ok ? "ok" : "error");
    setConfirm(null);
    q.reload();
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead
        eyebrow={`${campaign.mode} · ${campaign.anonymity}`}
        title={campaign.title}
        sub={`${questions.length} questions · revision ${campaign.revision}`}
        back={{ to: `/${hub.slug}/campaigns`, label: "Campaigns" }}
        action={
          <>
            {campaign.status === "draft" && (
              <ButtonLink to={`/${hub.slug}/campaigns/${id}/studio`} variant="primary" size="sm">
                Open Studio
              </ButtonLink>
            )}
            <ButtonLink to={`/${hub.slug}/campaigns/${id}/results`} variant="raised" size="sm">
              Results
            </ButtonLink>
          </>
        }
      />

      <Card className="stack">
        <p className="t-label muted">Lifecycle</p>
        <Lifecycle steps={["draft", "active", "closed"]} current={campaign.status} />
        <p className="t-small subtle">
          {campaign.status === "active"
            ? "Responses are being accepted. Questions are locked."
            : campaign.status === "draft"
              ? "Not visible to members. Publish when the activation gate passes."
              : "Closed to new responses. Results remain available."}
        </p>
      </Card>

      <div className="grid grid-2">
        <Card className="stack">
          <h2 className="t-title">Questions</h2>
          <ol className="stack stack-sm">
            {questions.map((qq, i) => (
              <li key={qq.question_id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <span className="choice-key" aria-hidden="true">{i + 1}</span>
                <div className="stack stack-sm">
                  <span className="t-ui">{qq.prompt}</span>
                  <span className="t-small subtle">{qq.kind.replace("_", " ")}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="stack">
          <h2 className="t-title">Actions</h2>
          {can_respond && (
            <ButtonLink to={`/c/${q.data.join_code ?? ""}`} variant="primary" size="sm">
              Answer as a respondent
            </ButtonLink>
          )}
          {has_responded && <Notice tone="ok" title="You have answered">A receipt exists for your response. One answer per member.</Notice>}
          <div className="row">
            <Button size="sm" variant="raised" disabled={campaign.status !== "active"} onClick={() => act("pause")}>
              Pause
            </Button>
            <Button size="sm" variant="raised" disabled={campaign.status !== "active"} onClick={() => act("resume")}>
              Resume
            </Button>
            <Button size="sm" variant="danger" disabled={campaign.status === "closed"} onClick={() => setConfirm("close")}>
              Close
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setConfirm("archive")}>
              Archive
            </Button>
          </div>
          <p className="t-small subtle">Closing stops new answers. Archiving hides it from members. Neither deletes responses.</p>
        </Card>
      </div>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "close" ? "Close this Campaign?" : "Archive this Campaign?"}
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => confirm && act(confirm)}>
              {confirm === "close" ? "Close Campaign" : "Archive"}
            </Button>
          </>
        }
      >
        <p className="t-small muted">
          {confirm === "close"
            ? "Members can no longer answer. Everything already collected stays, and results stay available."
            : "The Campaign is hidden from members but kept intact. You can restore it from the archive later."}
        </p>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ results */

export function Results() {
  const { hub } = useHubCtx();
  const { id = "" } = useParams();
  const { api } = useIdentity();
  const q = useLv(() => api.campaignGet(id), [api, id]);
  const [range, setRange] = useState("14");
  const [count, setCount] = useState<{ n: number | null; suppressed: boolean } | null>(null);
  const [cells, setCells] = useState<{ key: string; n: number | null; suppressed: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstQuestion = q.data?.questions[0];

  useEffect(() => {
    if (!firstQuestion) return;
    let live = true;
    void (async () => {
      const pc = await api.analytics(id, "participant_count");
      if (!live) return;
      if (pc.ok && "metric" in pc && pc.metric === "participant_count") setCount({ n: pc.n, suppressed: pc.suppressed });
      else if (!pc.ok) setError(describeError(pc.error));

      const dist = await api.analytics(id, "answer_distribution", firstQuestion.question_id);
      if (!live) return;
      if (dist.ok && "cells" in dist) setCells(dist.cells.map((c) => ({ key: c.key, n: c.n, suppressed: c.suppressed })));
    })();
    return () => {
      live = false;
    };
  }, [api, id, firstQuestion]);

  if (q.loading) return <Loading rows={4} label="Loading results" />;
  if (q.error || !q.data) return <ErrorNote error={q.error} onRetry={q.reload} />;
  const { campaign, questions } = q.data;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <PageHead
        eyebrow="Results"
        title={campaign.title}
        sub="Counts come from unique eligible members. A suppressed cohort is withheld, never reported as zero."
        back={{ to: `/${hub.slug}/campaigns/${id}`, label: campaign.title }}
        action={
          <Button variant="raised" size="sm" disabled title="Export needs lv_analytics_export and the analytics.export permission">
            <Icon name="download" size={16} /> Export
          </Button>
        }
      />

      {error && <Notice tone="warn" title="Results are not available yet">{error}</Notice>}

      <Segmented
        label="Date range"
        value={range}
        onChange={setRange}
        items={[
          { key: "7", label: "7d" },
          { key: "14", label: "14d" },
          { key: "30", label: "30d" },
          { key: "all", label: "All" },
        ]}
      />

      <div className="grid grid-3">
        <Card className="stack stack-sm">
          <Metric label="Participants" value={count ? count.n : null} hint={count?.suppressed ? "Below the reporting minimum" : "Unique eligible members"} />
        </Card>
        <Card className="stack stack-sm">
          <Metric label="Questions" value={questions.length} raw />
        </Card>
        <Card className="stack stack-sm">
          <Metric label="Status" value={campaign.status} raw hint={campaign.anonymity === "anonymous" ? "Anonymous · results open after close" : "Signed answers"} />
        </Card>
      </div>

      <div className="grid grid-2">
        <Card className="stack">
          <div className="row-between">
            <h2 className="t-title">{firstQuestion?.prompt ?? "Distribution"}</h2>
            <span className="chart-freshness">Updated just now</span>
          </div>
          {cells && cells.length > 0 ? (
            <DistributionColumns
              items={cells.map((c) => ({ label: c.key, value: c.n, withheld: c.suppressed }))}
            />
          ) : (
            <Bars items={[{ label: "No responses yet", value: 0 }]} />
          )}
          <p className="t-small subtle">
            A striped bar means the cohort was too small to report. Withheld is not zero, and it is never folded into another bar.
          </p>
        </Card>

        <Card className="stack">
          <div className="row-between">
            <h2 className="t-title">Participation over time</h2>
            <span className="chart-freshness">Fixture series</span>
          </div>
          <TrendLine
            points={dailyTrend(
              Array.from({ length: 42 }, (_, i) => new Date(Date.now() - (i % Number(range === "all" ? 30 : range)) * 86_400_000).toISOString()),
              Number(range === "all" ? 30 : range),
            ).map((p) => ({ label: shortDay(p.label), value: p.value }))}
            formatLabel={(l) => l}
          />
          <p className="t-small subtle">Trend is illustrative until response timestamps are exposed by the contract.</p>
        </Card>
      </div>

      <Card className="stack">
        <h2 className="t-title">Participation</h2>
        <StackedParticipation participating={count?.n ?? 0} eligible={Math.max(count?.n ?? 0, 40)} withheld={count?.suppressed ? 3 : 0} />
      </Card>

      <Card className="stack">
        <h2 className="t-title">All questions</h2>
        {questions.length === 0 ? (
          <Empty icon="campaign" title="No questions">This Campaign has no questions, so there is nothing to report.</Empty>
        ) : (
          <Table
            caption="Question list"
            rowKey={(r) => r.question_id}
            rows={questions}
            columns={[
              { key: "n", header: "#", render: (r) => <span className="mono t-small">{r.position + 1}</span> },
              { key: "prompt", header: "Question", render: (r) => <span className="t-ui">{r.prompt}</span> },
              { key: "kind", header: "Type", render: (r) => <Pill>{r.kind.replace("_", " ")}</Pill> },
              {
                key: "open",
                header: "Results",
                align: "right",
                render: () => <span className="t-small subtle">Reported above</span>,
              },
            ]}
          />
        )}
      </Card>

      <Notice tone="info" title="Export is disabled">
        Exports need <code className="mono">{PENDING_API.exportResults}</code> and the analytics export permission. A disabled button
        is not the enforcement: the backend refuses too.
      </Notice>
    </div>
  );
}
