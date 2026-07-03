import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { useOrg } from "../../org/OrgProvider";
import { QRCard } from "../../components/QRCard";
import { Icon } from "../../components/Icon";
import { CYCLE, STAPLES, WEEKDAYS, weekdayFor } from "../../lib/menu";
import { parseMenuWorkbook, type ParsedMenuWorkbookDay } from "../../lib/menuWorkbook";
import type { MenuCycle, MenuCycleDay, Session, SurveyQuestion, SurveyTemplate } from "../../types/db";

type Tab = "surveys" | "menu" | "launch" | "results";
type TemplateWithQuestions = SurveyTemplate & { questions: SurveyQuestion[] };
type SessionRow = Session & { survey_templates?: SurveyTemplate | null; menu_cycles?: MenuCycle | null };
type AnswerRow = {
  id: string;
  value: unknown;
  question_id: string;
  survey_questions?: { prompt: string; type: string } | null;
  responses?: { session_id: string; submitted_at: string } | null;
};

const DINING_VOICE_QUESTIONS = [
  { type: "rating", prompt: "Overall, how was the dining experience today?", required: true, category: "Satisfaction" },
  { type: "rating", prompt: "Taste and flavor", required: true, category: "Quality" },
  { type: "rating", prompt: "Freshness", required: false, category: "Quality" },
  { type: "rating", prompt: "Served hot / at the right temperature", required: false, category: "Quality" },
  { type: "single_choice", prompt: "How were the portions?", required: false, options: ["Too small", "Just right", "Too much"], category: "Service" },
  { type: "rating", prompt: "Menu variety", required: false, category: "Planning" },
  { type: "multi_choice", prompt: "What should we add more of?", required: false, options: ["Vegetarian options", "International dishes", "Healthier meals", "Bigger portions", "Fresh fruit and salad", "Late-night snacks", "Halal options"], category: "Planning" },
  { type: "text", prompt: "What should the kitchen know?", required: false, category: "Open feedback" },
  { type: "text", prompt: "Pitch a dish you want on the rotation", required: false, category: "Ideas" },
];

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function listFromText(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function asTextList(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(", ") : "";
}

export function ContentCentral() {
  const { profile } = useAuth();
  const { org } = useOrg();
  const [tab, setTab] = useState<Tab>("surveys");
  const [templates, setTemplates] = useState<TemplateWithQuestions[]>([]);
  const [cycles, setCycles] = useState<(MenuCycle & { days: MenuCycleDay[] })[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [showQr, setShowQr] = useState<string | null>(null);
  const [resultSessionId, setResultSessionId] = useState("");
  const [resultTemplateId, setResultTemplateId] = useState("");

  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateReward, setTemplateReward] = useState(50);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState("rating");
  const [qRequired, setQRequired] = useState(false);
  const [qOptions, setQOptions] = useState("");

  const [cycleTitle, setCycleTitle] = useState("MJCC 28-day cycle");
  const [cycleVersion, setCycleVersion] = useState(new Date().toLocaleDateString());
  const [cyclePaste, setCyclePaste] = useState("");
  const [cycleFileName, setCycleFileName] = useState("");
  const [cycleFileDays, setCycleFileDays] = useState<ParsedMenuWorkbookDay[]>([]);
  const [cycleFileBusy, setCycleFileBusy] = useState(false);

  const [launchTitle, setLaunchTitle] = useState("");
  const [launchTemplateId, setLaunchTemplateId] = useState("");
  const [launchCycleId, setLaunchCycleId] = useState("");
  const [launchDay, setLaunchDay] = useState<number | "">("");
  const [launchReward, setLaunchReward] = useState(50);

  async function load() {
    setLoading(true);
    const [templateRes, questionRes, cycleRes, dayRes, sessionRes, answerRes] = await Promise.all([
      supabase.from("survey_templates").select("*").order("updated_at", { ascending: false }),
      supabase.from("survey_questions").select("*").order("position"),
      supabase.from("menu_cycles").select("*").order("updated_at", { ascending: false }),
      supabase.from("menu_cycle_days").select("*").order("day_number"),
      supabase
        .from("sessions")
        .select("*, survey_templates(title, status, points_reward), menu_cycles(title)")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("survey_answers")
        .select("id, value, question_id, survey_questions(prompt, type), responses(session_id, submitted_at)")
        .order("created_at", { ascending: false })
        .limit(250),
    ]);

    if (templateRes.error || questionRes.error || cycleRes.error || dayRes.error || sessionRes.error) {
      setErr(
        templateRes.error?.message ||
          questionRes.error?.message ||
          cycleRes.error?.message ||
          dayRes.error?.message ||
          sessionRes.error?.message ||
          "Could not load Content Central."
      );
    }

    const questions = (questionRes.data ?? []) as SurveyQuestion[];
    setTemplates(
      ((templateRes.data ?? []) as SurveyTemplate[]).map((t) => ({
        ...t,
        questions: questions.filter((q) => q.template_id === t.id).sort((a, b) => a.position - b.position),
      }))
    );
    const days = (dayRes.data ?? []) as MenuCycleDay[];
    setCycles(
      ((cycleRes.data ?? []) as MenuCycle[]).map((c) => ({
        ...c,
        days: days.filter((d) => d.cycle_id === c.id).sort((a, b) => a.day_number - b.day_number),
      }))
    );
    setSessions((sessionRes.data ?? []) as unknown as SessionRow[]);
    setAnswers((answerRes.data ?? []) as unknown as AnswerRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = templates[0];
    if (t && !selectedTemplateId) setSelectedTemplateId(t.id);
    const published = templates.find((x) => x.status === "published");
    if (published && (!launchTemplateId || !templates.some((x) => x.id === launchTemplateId && x.status === "published"))) {
      setLaunchTemplateId(published.id);
      setLaunchReward(published.points_reward);
    }
  }, [templates, selectedTemplateId, launchTemplateId]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const publishedTemplates = templates.filter((t) => t.status === "published");
  const activeCycle = cycles.find((c) => c.is_active);
  const activeSessions = sessions.filter((s) => s.is_active);
  const draftTemplates = templates.filter((t) => t.status !== "published");
  const menuPasteLineCount = cyclePaste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
  const sessionTemplateById = useMemo(() => new Map(sessions.map((s) => [s.id, s.template_id])), [sessions]);
  const filteredAnswers = useMemo(() => {
    return answers.filter((a) => {
      const sessionId = a.responses?.session_id ?? "";
      if (resultSessionId && sessionId !== resultSessionId) return false;
      if (resultTemplateId && sessionTemplateById.get(sessionId) !== resultTemplateId) return false;
      return true;
    });
  }, [answers, resultSessionId, resultTemplateId, sessionTemplateById]);
  const resultGroups = useMemo(() => {
    const map = new Map<string, { prompt: string; type: string; count: number; ratings: number[]; options: Record<string, number>; texts: string[] }>();
    for (const a of filteredAnswers) {
      const prompt = a.survey_questions?.prompt ?? "Question";
      const type = a.survey_questions?.type ?? "text";
      const row = map.get(a.question_id) ?? { prompt, type, count: 0, ratings: [], options: {}, texts: [] };
      row.count += 1;
      if (typeof a.value === "number") row.ratings.push(a.value);
      if (typeof a.value === "string") row.texts.push(a.value);
      if (Array.isArray(a.value)) for (const v of a.value) row.options[String(v)] = (row.options[String(v)] ?? 0) + 1;
      if (typeof a.value === "string" && (type === "single_choice" || type === "yes_no")) {
        row.options[a.value] = (row.options[a.value] ?? 0) + 1;
      }
      map.set(a.question_id, row);
    }
    return Array.from(map.values());
  }, [filteredAnswers]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    const { data, error } = await supabase
      .from("survey_templates")
      .insert({
        title: templateTitle.trim(),
        description: templateDescription.trim() || null,
        points_reward: templateReward,
        created_by: profile?.id,
        org_id: org.id,
      })
      .select()
      .single();
    if (error) return setErr(error.message);
    setTemplateTitle("");
    setTemplateDescription("");
    setTemplateReward(50);
    setSelectedTemplateId(data.id);
    setOk("Survey template created.");
    await load();
  }

  async function createDiningVoiceTemplate() {
    setErr("");
    setOk("");
    const { data, error } = await supabase
      .from("survey_templates")
      .insert({
        title: "Dining Voice Check-in",
        description: "Prebuilt MJCC dining survey with ratings, portions, requests, comments, and dish ideas.",
        points_reward: 50,
        status: "published",
        created_by: profile?.id,
        org_id: org.id,
      })
      .select()
      .single();
    if (error) return setErr(error.message);
    const rows = DINING_VOICE_QUESTIONS.map((q, i) => ({
      template_id: data.id,
      position: i + 1,
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      options: "options" in q ? q.options : [],
      category: q.category,
      org_id: org!.id,
    }));
    const { error: qErr } = await supabase.from("survey_questions").insert(rows);
    if (qErr) return setErr(qErr.message);
    setSelectedTemplateId(data.id);
    setLaunchTemplateId(data.id);
    setOk("Prebuilt Dining Voice survey is ready to launch.");
    await load();
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate || !qPrompt.trim()) return;
    setErr("");
    const { error } = await supabase.from("survey_questions").insert({
      template_id: selectedTemplate.id,
      position: selectedTemplate.questions.length + 1,
      type: qType,
      prompt: qPrompt.trim(),
      required: qRequired,
      options: listFromText(qOptions),
      scale_min: 1,
      scale_max: 5,
      org_id: org.id,
    });
    if (error) return setErr(error.message);
    setQPrompt("");
    setQOptions("");
    setQRequired(false);
    await load();
  }

  async function setTemplateStatus(t: SurveyTemplate, status: string) {
    const { error } = await supabase.from("survey_templates").update({ status }).eq("id", t.id);
    if (error) setErr(error.message);
    else await load();
  }

  async function deleteQuestion(id: string) {
    const { error } = await supabase.from("survey_questions").delete().eq("id", id);
    if (error) setErr(error.message);
    else await load();
  }

  async function importStaticMenu() {
    setErr("");
    setOk("");
    const { data, error } = await supabase
      .from("menu_cycles")
      .insert({ title: cycleTitle.trim(), version_label: cycleVersion.trim() || null, is_active: true, created_by: profile?.id, org_id: org.id })
      .select()
      .single();
    if (error) return setErr(error.message);
    const breakfast = STAPLES.map((s) => s.name);
    const rows = CYCLE.map(([lunch, lunchAlt, dinner, dinnerAlt], i) => ({
      cycle_id: data.id,
      day_number: i + 1,
      weekday: weekdayFor(i),
      breakfast,
      lunch: [lunch, lunchAlt].filter(Boolean),
      dinner: [dinner, dinnerAlt].filter(Boolean),
      org_id: org.id,
    }));
    const { error: dayErr } = await supabase.from("menu_cycle_days").insert(rows);
    if (dayErr) return setErr(dayErr.message);
    setLaunchCycleId(data.id);
    setOk("Current 28-day menu was imported and activated.");
    await load();
  }

  async function importPastedMenu() {
    setErr("");
    setOk("");
    const lines = cyclePaste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length !== 28) {
      setErr("Paste exactly 28 lines: Day 1 | breakfast items | lunch items | dinner items");
      return;
    }
    const { data, error } = await supabase
      .from("menu_cycles")
      .insert({ title: cycleTitle.trim(), version_label: cycleVersion.trim() || null, is_active: false, created_by: profile?.id, org_id: org.id })
      .select()
      .single();
    if (error) return setErr(error.message);
    const rows = lines.map((line, i) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        cycle_id: data.id,
        day_number: i + 1,
        weekday: WEEKDAYS[i % 7],
        breakfast: listFromText(parts[1] ?? ""),
        lunch: listFromText(parts[2] ?? ""),
        dinner: listFromText(parts[3] ?? ""),
        notes: parts[4] || null,
        org_id: org.id,
      };
    });
    const { error: dayErr } = await supabase.from("menu_cycle_days").insert(rows);
    if (dayErr) return setErr(dayErr.message);
    setCyclePaste("");
    setOk("Menu cycle imported. Review it, then activate when ready.");
    await load();
  }

  async function previewMenuWorkbook(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setErr("");
    setOk("");
    setCycleFileDays([]);
    setCycleFileName("");
    if (!file) return;

    setCycleFileBusy(true);
    try {
      const days = await parseMenuWorkbook(file);
      setCycleFileDays(days);
      setCycleFileName(file.name);
      if (!cycleTitle.trim() || cycleTitle === "MJCC 28-day cycle") {
        setCycleTitle(file.name.replace(/\.[^.]+$/, ""));
      }
      setOk(`Read ${days.length} days from ${file.name}. Review the preview, then upload.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not read that workbook.");
    } finally {
      setCycleFileBusy(false);
    }
  }

  async function importWorkbookMenu() {
    setErr("");
    setOk("");
    if (cycleFileDays.length !== 28) {
      setErr("Choose a workbook that previews all 28 menu days first.");
      return;
    }

    const { data, error } = await supabase
      .from("menu_cycles")
      .insert({
        title: cycleTitle.trim() || cycleFileName.replace(/\.[^.]+$/, "") || "Imported 28-day cycle",
        version_label: cycleVersion.trim() || cycleFileName || null,
        is_active: false,
        created_by: profile?.id,
        org_id: org.id,
      })
      .select()
      .single();
    if (error) return setErr(error.message);

    const rows = cycleFileDays.map((day) => ({
      cycle_id: data.id,
      day_number: day.day_number,
      weekday: day.weekday,
      breakfast: day.breakfast,
      lunch: day.lunch,
      dinner: day.dinner,
      notes: day.notes,
      org_id: org.id,
    }));
    const { error: dayErr } = await supabase.from("menu_cycle_days").insert(rows);
    if (dayErr) {
      await supabase.from("menu_cycles").delete().eq("id", data.id);
      return setErr(dayErr.message);
    }

    setLaunchCycleId(data.id);
    setCycleFileDays([]);
    setCycleFileName("");
    setOk("Workbook menu cycle imported as a draft. Review it, then activate when ready.");
    await load();
  }

  async function activateCycle(c: MenuCycle) {
    setErr("");
    await supabase.from("menu_cycles").update({ is_active: false }).neq("id", c.id);
    const { error } = await supabase.from("menu_cycles").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) setErr(error.message);
    else await load();
  }

  async function launchSession(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    const template = templates.find((t) => t.id === launchTemplateId);
    if (!template || template.status !== "published") {
      setErr("Publish a survey template before launching it.");
      return;
    }
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        title: launchTitle.trim() || template?.title || "Dining survey",
        description: template?.description ?? null,
        join_code: genCode(),
        points_reward: launchReward,
        menu_day: launchDay === "" ? null : Number(launchDay),
        template_id: launchTemplateId || null,
        menu_cycle_id: launchCycleId || null,
        created_by: profile?.id,
        org_id: org.id,
      })
      .select()
      .single();
    if (error) return setErr(error.message);
    setLaunchTitle("");
    setShowQr(data.id);
    setOk("Survey session launched. Share the QR or join code.");
    await load();
  }

  if (loading) return <div className="card muted">Loading Content Central...</div>;

  return (
    <>
      <div className="page-head">
        <h2>Content Central</h2>
        <p className="hint">Build surveys, manage the menu cycle, launch QR sessions, and watch results come in.</p>
      </div>

      <div className="manager-grid">
        <div className="metric-tile"><div className="num">{templates.length}</div><div className="lbl">Survey templates</div></div>
        <div className="metric-tile"><div className="num">{publishedTemplates.length}</div><div className="lbl">Ready to launch</div></div>
        <div className="metric-tile"><div className="num">{activeSessions.length}</div><div className="lbl">Active sessions</div></div>
        <div className="metric-tile"><div className="num">{activeCycle ? "1" : "0"}</div><div className="lbl">Active menu cycle</div></div>
      </div>

      <div className="manager-panel">
        <span className="eyebrow">Sudo manager workflow</span>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, marginTop: 6 }}>Build better surveys from the menu outward.</h2>
        <p className="hint">Start with a focused template, connect it to the current menu day, then watch results by session so the kitchen can act quickly.</p>
        <div className="tool-grid">
          <div className="tool-note"><b>Ask one clear thing</b><span>Use required ratings sparingly and keep open text for ideas or problems.</span></div>
          <div className="tool-note"><b>Tie it to a meal</b><span>Attach a menu cycle and day so answers map back to actual dishes.</span></div>
          <div className="tool-note"><b>Read live results</b><span>Filter by session before changing menus or rewards.</span></div>
        </div>
      </div>

      <div className="content-tabs">
        {[
          ["surveys", "Survey builder", "survey"],
          ["menu", "Menu cycle", "menu"],
          ["launch", "Launch", "arrow"],
          ["results", "Results", "dashboard"],
        ].map(([key, label, icon]) => (
          <button key={key} className={`content-tab${tab === key ? " active" : ""}`} onClick={() => setTab(key as Tab)}>
            <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={16} /> {label}
          </button>
        ))}
      </div>

      {err && <div className="notice err">{err}</div>}
      {ok && <div className="notice ok">{ok}</div>}

      {tab === "surveys" && (
        <>
          <div className="row2">
            <div className="card">
              <h2>New template</h2>
              <p className="hint">Start blank for a specific question, or use the prebuilt Dining Voice survey for daily feedback.</p>
              <form onSubmit={createTemplate} className="stack">
                <div className="field-block">
                  <label className="field">Title</label>
                  <input value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} required placeholder="Lunch pulse check" />
                </div>
                <div className="field-block">
                  <label className="field">Description</label>
                  <textarea rows={2} value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="What this survey helps the kitchen decide" />
                </div>
                <div className="field-block">
                  <label className="field">Default reward</label>
                  <input type="number" min={0} value={templateReward} onChange={(e) => setTemplateReward(Number(e.target.value))} />
                </div>
                <button className="btn btn-primary btn-block"><Icon name="plus" size={16} /> Create blank template</button>
              </form>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={createDiningVoiceTemplate}>
                <Icon name="sparkle" size={16} /> Use Dining Voice template
              </button>
            </div>

            <div className="card">
              <h2>Question editor</h2>
              <p className="hint">Pick a template, then add the questions students will answer.</p>
              <div className="field-block">
                <label className="field">Template</label>
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
              {templates.length === 0 && <div className="notice ok">Create or import a template to unlock the question editor.</div>}
              <form onSubmit={addQuestion} className="stack">
                <div className="field-block">
                  <label className="field">Question</label>
                  <input value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} placeholder="e.g. How was the taste?" />
                </div>
                <div className="row2">
                  <div className="field-block">
                    <label className="field">Answer type</label>
                    <select value={qType} onChange={(e) => setQType(e.target.value)}>
                      <option value="rating">1-5 rating</option>
                      <option value="text">Text</option>
                      <option value="single_choice">Single choice</option>
                      <option value="multi_choice">Multi choice</option>
                      <option value="yes_no">Yes / No</option>
                    </select>
                  </div>
                  <div className="field-block">
                    <label className="field">Requirement</label>
                    <label className="check-row"><input type="checkbox" checked={qRequired} onChange={(e) => setQRequired(e.target.checked)} /> Required</label>
                  </div>
                </div>
                {(qType === "single_choice" || qType === "multi_choice") && (
                  <div className="field-block">
                    <label className="field">Choice options</label>
                    <textarea rows={3} value={qOptions} onChange={(e) => setQOptions(e.target.value)} placeholder="One option per line" />
                  </div>
                )}
                <button className="btn btn-solid btn-block" disabled={!selectedTemplate || !qPrompt.trim()}>
                  <Icon name="plus" size={16} /> Add question
                </button>
              </form>
            </div>
          </div>

          {draftTemplates.length > 0 && <p className="hint">{draftTemplates.length} draft template{draftTemplates.length === 1 ? "" : "s"} need publishing before launch.</p>}
          {templates.length === 0 && <div className="card"><h2>No surveys yet</h2><p className="hint">Use Dining Voice for the fastest start, then tune the questions after students begin answering.</p></div>}
          {templates.map((t) => (
            <div key={t.id} className="card template-row">
              <div className="spread">
                <div>
                  <h2>{t.title} <span className={`pill ${t.status === "published" ? "ready" : "collected"}`}>{t.status}</span>{selectedTemplateId === t.id && " "}<span className="pill collected">{selectedTemplateId === t.id ? "editing" : `${t.questions.length} questions`}</span></h2>
                  <p className="hint" style={{ margin: 0 }}>{t.description || "No description"} - {t.points_reward} pts - {t.questions.length} questions</p>
                </div>
                <div className="template-actions">
                  <button className="btn btn-ghost" onClick={() => setSelectedTemplateId(t.id)}>Edit</button>
                  <button className="btn btn-solid" onClick={() => setTemplateStatus(t, t.status === "published" ? "draft" : "published")}>
                    {t.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </div>
              </div>
              {selectedTemplateId === t.id && (
                t.questions.length === 0 ? <p className="hint" style={{ marginTop: 12 }}>No questions yet. Add a rating, choice, or text question above.</p> :
                t.questions.map((q) => (
                  <div key={q.id} className="item-row">
                    <div className="item-name">
                      {q.position}. {q.prompt}
                      <small>{q.type}{q.required ? " - required" : ""}{Array.isArray(q.options) && q.options.length ? ` - ${asTextList(q.options)}` : ""}</small>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => deleteQuestion(q.id)}>Remove</button>
                  </div>
                ))
              )}
            </div>
          ))}
        </>
      )}

      {tab === "menu" && (
        <>
          <div className="card">
            <h2>Upload 28-day cycle</h2>
            <p className="hint">Import the current built-in MJCC menu, or paste 28 lines using: Day 1 | breakfast | lunch | dinner.</p>
            <div className="row2">
              <div className="field-block">
                <label className="field">Cycle title</label>
                <input value={cycleTitle} onChange={(e) => setCycleTitle(e.target.value)} placeholder="Cycle title" />
              </div>
              <div className="field-block">
                <label className="field">Version label</label>
                <input value={cycleVersion} onChange={(e) => setCycleVersion(e.target.value)} placeholder="Version label" />
              </div>
            </div>
            <button className="btn btn-primary" onClick={importStaticMenu}><Icon name="menu" size={16} /> Import current app menu</button>
            <div className="field-block" style={{ marginTop: 14 }}>
              <label className="field">Excel workbook</label>
              <input type="file" accept=".xlsx,.xlsm" onChange={previewMenuWorkbook} disabled={cycleFileBusy} />
              <div className="input-help">
                <span>{cycleFileName || "Use the cafeteria workbook with a 28 Day Menu sheet."}</span>
                <b>{cycleFileBusy ? "Reading..." : `${cycleFileDays.length}/28 days`}</b>
              </div>
            </div>
            {cycleFileDays.length > 0 && (
              <div className="menu-import-preview">
                {cycleFileDays.slice(0, 4).map((day) => (
                  <div key={day.day_number} className="menu-import-day">
                    <b>Day {day.day_number} - {day.weekday}</b>
                    <span>Lunch: {asTextList(day.lunch.slice(0, 3))}</span>
                    <span>Dinner: {asTextList(day.dinner.slice(0, 3))}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-solid btn-block" style={{ marginTop: 10 }} onClick={importWorkbookMenu} disabled={cycleFileDays.length !== 28 || cycleFileBusy}>
              <Icon name="arrow" size={16} /> Upload workbook cycle
            </button>
            <textarea rows={8} style={{ marginTop: 12 }} value={cyclePaste} onChange={(e) => setCyclePaste(e.target.value)} placeholder="Day 1 | Eggs, oatmeal | Char Sui Pork, Chef's Choice | Tuna Casserole, Pasta Shell" />
            <div className="input-help"><span>Paste one line per day with sections separated by pipes.</span><b>{menuPasteLineCount}/28 lines</b></div>
            <button className="btn btn-solid btn-block" style={{ marginTop: 10 }} onClick={importPastedMenu}><Icon name="arrow" size={16} /> Upload pasted cycle</button>
          </div>

          {cycles.length === 0 && <div className="card"><h2>No menu cycle loaded</h2><p className="hint">Import the current app menu first so launched surveys can point at real menu days.</p></div>}
          {cycles.map((c) => (
            <div key={c.id} className="card">
              <div className="spread">
                <div>
                  <h2>{c.title} <span className={`pill ${c.is_active ? "ready" : "collected"}`}>{c.is_active ? "active" : "draft"}</span></h2>
                  <p className="hint" style={{ margin: 0 }}>{c.version_label || "No version"} - {c.days.length}/28 days loaded</p>
                </div>
                <button className="btn btn-solid" onClick={() => activateCycle(c)}>{c.is_active ? "Deactivate" : "Activate"}</button>
              </div>
              <div className="menu-grid" style={{ marginTop: 12 }}>
                {c.days.slice(0, 6).map((d) => (
                  <div key={d.id} className="menu-day card">
                    <div className="cat-label">Day {d.day_number} - {d.weekday}</div>
                    <div className="menu-meal"><span className="meal-tag">Lunch</span>{asTextList(d.lunch)}</div>
                    <div className="menu-meal"><span className="meal-tag">Dinner</span>{asTextList(d.dinner)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "launch" && (
        <>
          <div className="card">
            <h2>Launch survey session</h2>
            <p className="hint">This creates the join code and QR students scan. Use published templates for student-facing surveys.</p>
            {publishedTemplates.length === 0 && <div className="notice err">Publish at least one survey template before launching.</div>}
            <form onSubmit={launchSession} className="stack">
              <div className="field-block">
                <label className="field">Session title</label>
                <input value={launchTitle} onChange={(e) => setLaunchTitle(e.target.value)} placeholder="Defaults to template title" />
              </div>
              <div className="row2">
                <div className="field-block">
                  <label className="field">Survey template</label>
                  <select value={launchTemplateId} onChange={(e) => {
                    setLaunchTemplateId(e.target.value);
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) setLaunchReward(t.points_reward);
                  }}>
                    <option value="">No dynamic template</option>
                    {publishedTemplates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <div className="field-block">
                  <label className="field">Menu cycle</label>
                  <select value={launchCycleId} onChange={(e) => setLaunchCycleId(e.target.value)}>
                    <option value="">No menu cycle</option>
                    {cycles.map((c) => <option key={c.id} value={c.id}>{c.title}{c.is_active ? " (active)" : ""}</option>)}
                  </select>
                </div>
              </div>
              <div className="row2">
                <div className="field-block">
                  <label className="field">Menu day</label>
                  <select value={launchDay} onChange={(e) => setLaunchDay(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">No specific menu day</option>
                    {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
                  </select>
                </div>
                <div className="field-block">
                  <label className="field">Point reward</label>
                  <input type="number" min={0} value={launchReward} onChange={(e) => setLaunchReward(Number(e.target.value))} />
                </div>
              </div>
              <button className="btn btn-primary btn-block"><Icon name="arrow" size={16} /> Launch session</button>
            </form>
          </div>

          {sessions.length === 0 && <div className="card"><h2>No sessions launched</h2><p className="hint">Launch a published survey to get a join code and QR students can scan.</p></div>}
          {sessions.map((s) => (
            <div key={s.id} className="card">
              <div className="spread">
                <div>
                  <h2>{s.title} <span className={`pill ${s.is_active ? "ready" : "collected"}`}>{s.is_active ? "active" : "closed"}</span></h2>
                  <p className="hint" style={{ margin: 0 }}>Code <b className="mono">{s.join_code}</b> - {s.points_reward} pts - {s.survey_templates?.title || "fixed survey"}</p>
                </div>
                <button className="btn btn-solid" onClick={() => setShowQr(showQr === s.id ? null : s.id)}>{showQr === s.id ? "Hide QR" : "Show QR"}</button>
              </div>
              {showQr === s.id && <div style={{ marginTop: 14 }}><QRCard code={s.join_code} /></div>}
            </div>
          ))}
        </>
      )}

      {tab === "results" && (
        <div className="card">
          <h2>Live survey results</h2>
          <p className="hint">Filter by session or template before making menu decisions.</p>
          <div className="row2">
            <div className="field-block">
              <label className="field">Session</label>
              <select value={resultSessionId} onChange={(e) => setResultSessionId(e.target.value)}>
                <option value="">All sessions</option>
                {sessions.map((s) => <option key={s.id} value={s.id}>{s.title} - {s.join_code}</option>)}
              </select>
            </div>
            <div className="field-block">
              <label className="field">Template</label>
              <select value={resultTemplateId} onChange={(e) => setResultTemplateId(e.target.value)}>
                <option value="">All templates</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          {resultGroups.length === 0 ? (
            <p className="muted">No dynamic survey answers match this view yet.</p>
          ) : resultGroups.map((g) => {
            const avg = g.ratings.length ? g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length : null;
            return (
              <div key={g.prompt} className="item-row" style={{ alignItems: "flex-start" }}>
                <div className="item-name" style={{ flex: 1 }}>
                  {g.prompt}
                  <small>{g.count} answer{g.count === 1 ? "" : "s"}</small>
                  {Object.entries(g.options).map(([label, count]) => (
                    <div key={label} className="result-bar"><span>{label}</span><b style={{ width: `${Math.max(8, count * 18)}px` }} /> <em>{count}</em></div>
                  ))}
                  {g.texts.slice(0, 4).map((text, i) => <small key={i} className="quote-line">{text}</small>)}
                </div>
                {avg !== null && <span className="avg"><Icon name="star-fill" size={13} /> {avg.toFixed(1)}</span>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
