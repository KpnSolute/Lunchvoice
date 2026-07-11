import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { useOrg } from "../../org/OrgProvider";
import { QRCard } from "../../components/QRCard";
import { Icon } from "../../components/Icon";
import { Bars, DistributionColumns, TrendLine, dailyTrend, shortDay } from "../../components/charts";
import { displayDaysFromCycle, formatMenuDate, groupMenuWeeks, type DisplayMenuDay } from "../../lib/menuDisplay";
import type { MenuCycle, MenuCycleDay, Session, SurveyQuestion, SurveyTemplate } from "../../types/db";

type Tab = "surveys" | "menu" | "launch" | "results";
type TemplateWithQuestions = SurveyTemplate & { questions: SurveyQuestion[] };
type SessionRow = Session & { survey_templates?: SurveyTemplate | null; menu_cycles?: MenuCycle | null };
type AnswerRow = {
  id: string;
  value: unknown;
  question_id: string;
  survey_questions?: { prompt: string; type: string } | null;
  responses?: { id: string; session_id: string; submitted_at: string } | null;
};
type ResponseRow = { id: string; session_id: string; submitted_at: string };

const CONTENT_TOUR_STEPS: { title: string; body: string; tab: Tab }[] = [
  {
    title: "Welcome to Content Central",
    body: "This is where staff build surveys, connect them to menu days, launch QR sessions, and review student feedback. This guide appears once for your staff account.",
    tab: "surveys",
  },
  {
    title: "1. Create a survey template",
    body: "Start with a blank template and give it a clear title, purpose, and point reward. For a faster start, choose the prebuilt Dining Voice template.",
    tab: "surveys",
  },
  {
    title: "2. Add the questions",
    body: "Select your template in Question editor. Add a ready-made question pack or create rating, choice, slider, yes/no, and open-text questions. Keep required questions focused.",
    tab: "surveys",
  },
  {
    title: "3. Publish and launch",
    body: "Publish the finished template, open Launch, connect the menu cycle/day, choose points and duration, then create the QR code and join code students will use.",
    tab: "launch",
  },
  {
    title: "4. Read and act on results",
    body: "Results update as students respond. Filter by session or template, compare ratings and comments, then use the findings to improve the next meal or survey.",
    tab: "results",
  },
];

function StaffMealList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="menu-meal-block">
      <div className="meal-tag">{label}</div>
      {items.length ? (
        <ul className="menu-item-list compact">
          {items.map((item, index) => <li key={`${label}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <div className="menu-empty">Not scheduled</div>
      )}
    </div>
  );
}

function StaffMenuDayCard({ day, isToday }: { day: DisplayMenuDay; isToday: boolean }) {
  return (
    <article className={`menu-day ${isToday ? "is-today" : ""}`}>
      <div className="menu-day-head">
        <div>
          <div className="cat-label">Day {day.cycleDay}</div>
          <h3>{day.weekday}</h3>
          {day.date && <span>{formatMenuDate(day.date)}</span>}
        </div>
        {isToday && <span className="pill ready">today</span>}
      </div>
      <StaffMealList label="Breakfast" items={day.breakfast} />
      <StaffMealList label="Lunch" items={day.lunch} />
      <StaffMealList label="Dinner" items={day.dinner} />
    </article>
  );
}

const DINING_VOICE_QUESTIONS = [
  { type: "rating", prompt: "Overall, how satisfied are you with the dining hall?", required: true, category: "Satisfaction", help_text: "1 poor, 5 great" },
  { type: "rating", prompt: "Taste & flavor", required: true, category: "Food quality" },
  { type: "rating", prompt: "Freshness", required: false, category: "Food quality" },
  { type: "rating", prompt: "Served hot / at temp", required: false, category: "Food quality" },
  { type: "single_choice", prompt: "How are the portion sizes?", required: true, options: ["Too small", "Just right", "Too much"], category: "Portions" },
  { type: "rating", prompt: "Menu variety", required: false, category: "Menu variety", help_text: "Enough different options?" },
  { type: "rating", prompt: "Cleanliness & staff", required: false, category: "Cleanliness & staff", help_text: "Dining hall & service" },
  { type: "multi_choice", prompt: "What would you like more of?", required: false, options: ["More vegetarian options", "More international dishes", "Healthier / lighter meals", "Bigger portions", "More variety week to week", "Fresh fruit & salad bar", "Late-night snacks", "Halal options"], category: "Planning", help_text: "Pick any that apply." },
  { type: "text", prompt: "Suggest a dish for the kitchen", required: false, category: "Ideas", help_text: "e.g. Rice bowls, more grilled chicken..." },
  { type: "text", prompt: "Anything else you'd like the team to know?", required: false, category: "Open feedback", help_text: "Taste, freshness, timing, cleanliness, staff - tell us anything." },
];

const QUESTION_PACKS = [
  {
    name: "Meal pulse",
    helper: "Three fast answers after lunch or dinner.",
    questions: [
      { type: "rating", prompt: "How was today's main dish?", required: true, category: "Meal quality" },
      { type: "single_choice", prompt: "Was the portion right?", required: true, options: ["Too small", "Just right", "Too much"], category: "Portion" },
      { type: "text", prompt: "What one thing should the kitchen adjust?", required: false, category: "Open feedback" },
    ],
  },
  {
    name: "Menu planning",
    helper: "Good for deciding what to repeat or retire.",
    questions: [
      { type: "multi_choice", prompt: "What do you want more of on the cycle?", required: true, options: ["Chicken", "Seafood", "Vegetarian", "Breakfast-for-dinner", "International dishes", "Fresh salad or fruit"], category: "Planning" },
      { type: "text", prompt: "Name one meal we should add next cycle.", required: false, category: "Ideas" },
      { type: "yes_no", prompt: "Should today's meal come back?", required: true, category: "Planning" },
    ],
  },
  {
    name: "Service check",
    helper: "Short line, temperature, and serving feedback.",
    questions: [
      { type: "rating", prompt: "Was the food served at the right temperature?", required: true, category: "Service" },
      { type: "rating", prompt: "How was the line speed today?", required: false, category: "Service" },
      { type: "text", prompt: "Anything staff should know before the next service?", required: false, category: "Service" },
    ],
  },
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

const SESSION_DURATION_OPTIONS = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "1 day", minutes: 1440 },
  { label: "2 days", minutes: 2880 },
  { label: "1 week", minutes: 10080 },
  { label: "No auto-lock", minutes: 0 },
];

const VOICE_ANNOUNCEMENT_KINDS = [
  { value: "announcement", label: "Announcement" },
  { value: "bonus", label: "Prize bonus" },
  { value: "special", label: "Menu special" },
  { value: "event", label: "MJCC event" },
  { value: "result", label: "Survey result" },
];

function sessionClosesAt(minutes: number): string | null {
  if (!minutes) return null;
  return new Date(Date.now() + minutes * 60000).toISOString();
}

function isSessionOpen(s: Pick<Session, "is_active" | "closes_at">): boolean {
  if (!s.is_active) return false;
  if (!s.closes_at) return true;
  return new Date(s.closes_at).getTime() > Date.now();
}

function closeText(value: string | null | undefined): string {
  if (!value) return "no auto-lock";
  const time = new Date(value);
  if (time.getTime() <= Date.now()) return "locked by time";
  return `locks ${time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

// Bucket numeric answers into scale positions (1-5 for ratings/flames, 0-10 for sliders).
function ratingBuckets(values: number[], type: string): { buckets: number[]; labels: string[] } {
  const min = type === "slider" ? 0 : 1;
  const max = type === "slider" ? 10 : 5;
  const buckets = Array.from({ length: max - min + 1 }, () => 0);
  for (const v of values) {
    const i = Math.round(v) - min;
    if (i >= 0 && i < buckets.length) buckets[i] += 1;
  }
  return { buckets, labels: buckets.map((_, i) => String(min + i)) };
}

export function ContentCentral() {
  const { profile } = useAuth();
  const { org } = useOrg();
  const [tab, setTab] = useState<Tab>("surveys");
  const [templates, setTemplates] = useState<TemplateWithQuestions[]>([]);
  const [cycles, setCycles] = useState<(MenuCycle & { days: MenuCycleDay[] })[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [showQr, setShowQr] = useState<string | null>(null);
  const [sessionDurationDrafts, setSessionDurationDrafts] = useState<Record<string, number>>({});
  const [resultSessionId, setResultSessionId] = useState("");
  const [resultTemplateId, setResultTemplateId] = useState("");
  const [tourStep, setTourStep] = useState<number | null>(null);

  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateReward, setTemplateReward] = useState(50);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState("rating");
  const [qRequired, setQRequired] = useState(false);
  const [qOptions, setQOptions] = useState("");
  const [qHelp, setQHelp] = useState("");
  const [qCategory, setQCategory] = useState("");

  const [launchTitle, setLaunchTitle] = useState("");
  const [launchTemplateId, setLaunchTemplateId] = useState("");
  const [launchCycleId, setLaunchCycleId] = useState("");
  const [launchDay, setLaunchDay] = useState<number | "">("");
  const [launchReward, setLaunchReward] = useState(50);
  const [launchDuration, setLaunchDuration] = useState(120);
  const [voiceKind, setVoiceKind] = useState("announcement");
  const [voiceDay, setVoiceDay] = useState<number | "">("");
  const [voiceBody, setVoiceBody] = useState("");

  async function load() {
    setLoading(true);
    const [templateRes, questionRes, cycleRes, dayRes, sessionRes, responseRes, answerRes] = await Promise.all([
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
        .from("responses")
        .select("id, session_id, submitted_at")
        .order("submitted_at", { ascending: false })
        .limit(1000),
      supabase
        .from("survey_answers")
        .select(
          "id, value, question_id, survey_questions!survey_answers_question_id_fkey(prompt, type), responses!survey_answers_response_id_fkey(id, session_id, submitted_at)",
        )
        .order("created_at", { ascending: false })
        .limit(250),
    ]);

    if (templateRes.error || questionRes.error || cycleRes.error || dayRes.error || sessionRes.error || responseRes.error || answerRes.error) {
      setErr(
        templateRes.error?.message ||
          questionRes.error?.message ||
          cycleRes.error?.message ||
          dayRes.error?.message ||
          sessionRes.error?.message ||
          responseRes.error?.message ||
          answerRes.error?.message ||
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
    setResponses((responseRes.data ?? []) as unknown as ResponseRow[]);
    setAnswers((answerRes.data ?? []) as unknown as AnswerRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const key = `lunchvoice:content-tour:v1:${profile.id}`;
    if (!window.localStorage.getItem(key)) setTourStep(0);
  }, [profile?.id]);

  useEffect(() => {
    if (tourStep === null) return;
    setTab(CONTENT_TOUR_STEPS[tourStep].tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tourStep]);

  function finishTour() {
    if (profile?.id) window.localStorage.setItem(`lunchvoice:content-tour:v1:${profile.id}`, "complete");
    setTourStep(null);
  }

  useEffect(() => {
    const t = templates[0];
    if (t && !selectedTemplateId) setSelectedTemplateId(t.id);
    const published = templates.find((x) => x.status === "published");
    if (published && (!launchTemplateId || !templates.some((x) => x.id === launchTemplateId && x.status === "published"))) {
      setLaunchTemplateId(published.id);
      setLaunchReward(published.points_reward);
    }
  }, [templates, selectedTemplateId, launchTemplateId]);

  // Sensible launch default: the active menu cycle, so sessions map to real dishes without extra clicks.
  useEffect(() => {
    const active = cycles.find((c) => c.is_active);
    if (active) setLaunchCycleId((cur) => cur || active.id);
  }, [cycles]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const publishedTemplates = templates.filter((t) => t.status === "published");
  const activeCycle = cycles.find((c) => c.is_active);
  const activeCycleDisplayDays = activeCycle ? displayDaysFromCycle(activeCycle) : [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const activeCycleToday = activeCycleDisplayDays.find((day) => day.date === todayIso);
  const activeSessions = sessions.filter(isSessionOpen);
  const draftTemplates = templates.filter((t) => t.status !== "published");
  const sessionTemplateById = useMemo(() => new Map(sessions.map((s) => [s.id, s.template_id])), [sessions]);
  const sessionResponseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const response of responses) {
      map.set(response.session_id, (map.get(response.session_id) ?? 0) + 1);
    }
    return map;
  }, [responses]);
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
  const resultTrend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of filteredAnswers) {
      if (a.responses?.id && a.responses.submitted_at) seen.set(a.responses.id, a.responses.submitted_at);
    }
    return dailyTrend([...seen.values()], 14);
  }, [filteredAnswers]);
  const resultStats = useMemo(() => {
    const responseIds = new Set<string>();
    let ratingSum = 0;
    let ratingCount = 0;
    let textCount = 0;
    for (const a of filteredAnswers) {
      if (a.responses?.id) responseIds.add(a.responses.id);
      if (typeof a.value === "number") {
        ratingSum += a.value;
        ratingCount += 1;
      }
      if (typeof a.value === "string" && a.value.trim()) textCount += 1;
    }
    return {
      responses: responseIds.size,
      answers: filteredAnswers.length,
      avg: ratingCount ? ratingSum / ratingCount : null,
      textCount,
    };
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
      help_text: "help_text" in q ? q.help_text : null,
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
      help_text: qHelp.trim() || null,
      category: qCategory.trim() || null,
      scale_min: qType === "slider" ? 0 : 1,
      scale_max: qType === "slider" ? 10 : 5,
      org_id: org.id,
    });
    if (error) return setErr(error.message);
    setQPrompt("");
    setQOptions("");
    setQHelp("");
    setQCategory("");
    setQRequired(false);
    await load();
  }

  async function addQuestionPack(pack: (typeof QUESTION_PACKS)[number]) {
    if (!selectedTemplate) {
      setErr("Create or select a template before adding a question pack.");
      return;
    }
    setErr("");
    setOk("");
    const rows = pack.questions.map((q, i) => ({
      template_id: selectedTemplate.id,
      position: selectedTemplate.questions.length + i + 1,
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      options: "options" in q ? q.options : [],
      category: q.category,
      scale_min: 1,
      scale_max: 5,
      org_id: org.id,
    }));
    const { error } = await supabase.from("survey_questions").insert(rows);
    if (error) return setErr(error.message);
    setOk(`${pack.name} questions added to ${selectedTemplate.title}.`);
    await load();
  }

  async function setTemplateStatus(t: SurveyTemplate, status: string) {
    setErr("");
    setOk("");
    const { error } = await supabase.from("survey_templates").update({ status }).eq("id", t.id);
    if (error) return setErr(error.message);
    if (status === "published") {
      setOk(`"${t.title}" is published. Next: hit Launch to create the QR session students scan.`);
    } else {
      setOk(`"${t.title}" moved back to draft.`);
    }
    await load();
  }

  // One-click path from a published template to a live session: preselect it and jump to Launch.
  function goLaunch(t: TemplateWithQuestions) {
    setLaunchTemplateId(t.id);
    setLaunchReward(t.points_reward);
    setTab("launch");
    setErr("");
    setOk("");
  }

  async function deleteQuestion(id: string) {
    const { error } = await supabase.from("survey_questions").delete().eq("id", id);
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
        closes_at: sessionClosesAt(launchDuration),
        created_by: profile?.id,
        org_id: org.id,
      })
      .select()
      .single();
    if (error) return setErr(error.message);
    setLaunchTitle("");
    setLaunchDuration(120);
    setShowQr(data.id);
    setOk("Survey session launched. Share the QR or join code.");
    await load();
  }

  async function toggleSession(s: SessionRow) {
    setErr("");
    setOk("");
    const opening = !isSessionOpen(s);
    const update: Partial<Session> = { is_active: opening };
    if (opening && s.closes_at && new Date(s.closes_at).getTime() <= Date.now()) update.closes_at = null;
    const { error } = await supabase.from("sessions").update(update).eq("id", s.id);
    if (error) return setErr(error.message);
    setOk(opening ? "Session reopened." : "Session closed.");
    await load();
  }

  async function setSessionDuration(s: SessionRow) {
    setErr("");
    setOk("");
    const minutes = sessionDurationDrafts[s.id] ?? 30;
    const closesAt = minutes === 0 ? null : sessionClosesAt(minutes);
    const { error } = await supabase
      .from("sessions")
      .update({ is_active: true, closes_at: closesAt })
      .eq("id", s.id);
    if (error) return setErr(error.message);
    const duration = SESSION_DURATION_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `${minutes} minutes`;
    setOk(minutes === 0 ? "Session set to stay open until manually closed." : `Session duration set to ${duration} from now.`);
    await load();
  }

  async function postVoiceAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    const text = voiceBody.trim();
    if (text.length < 8) {
      setErr("Write a little more before posting to Voice.");
      return;
    }
    const { error } = await supabase.from("voice_notes").insert({
      kind: voiceKind,
      body: text,
      menu_day: voiceDay === "" ? null : Number(voiceDay),
      meal_period: voiceKind,
      status: "visible",
      org_id: org.id,
    });
    if (error) return setErr(error.message);
    setVoiceBody("");
    setVoiceDay("");
    setOk("Posted to Student Voice.");
  }

  if (loading) return <div className="card muted">Loading Content Central...</div>;

  return (
    <>
      <div className="page-head spread">
        <div>
          <h2>Content Central</h2>
          <p className="hint">Build surveys, manage the menu cycle, launch QR sessions, and watch results come in.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => setTourStep(0)}><Icon name="sparkle" size={16} /> Show guide</button>
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
              <div className="question-packs">
                {QUESTION_PACKS.map((pack) => (
                  <button key={pack.name} type="button" className="pack-card" onClick={() => addQuestionPack(pack)} disabled={!selectedTemplate}>
                    <b>{pack.name}</b>
                    <span>{pack.helper}</span>
                    <em>{pack.questions.length} questions</em>
                  </button>
                ))}
              </div>
              <form onSubmit={addQuestion} className="stack">
                <div className="field-block">
                  <label className="field">Question</label>
                  <input value={qPrompt} onChange={(e) => setQPrompt(e.target.value)} placeholder="e.g. How was the taste?" />
                </div>
                <div className="row2">
                  <div className="field-block">
                    <label className="field">Section</label>
                    <input value={qCategory} onChange={(e) => setQCategory(e.target.value)} placeholder="Food quality, Planning, Service" />
                  </div>
                  <div className="field-block">
                    <label className="field">Help text</label>
                    <input value={qHelp} onChange={(e) => setQHelp(e.target.value)} placeholder="Short hint shown under the question" />
                  </div>
                </div>
                <div className="row2">
                  <div className="field-block">
                    <label className="field">Answer type</label>
                    <select value={qType} onChange={(e) => setQType(e.target.value)}>
                      <option value="rating">Rating scale: 1 to 5 stars</option>
                      <option value="flame">Hype scale: 1 to 5 flames</option>
                      <option value="slider">Slider: 0 to 10</option>
                      <option value="single_choice">Single choice buttons</option>
                      <option value="multi_choice">Multi-select chips</option>
                      <option value="yes_no">Yes / No buttons</option>
                      <option value="text">Open text input</option>
                    </select>
                    <div className="input-help">
                      <span>{
                        qType === "rating" ? "Students tap 1-5 stars." :
                        qType === "flame" ? "Students tap 1-5 flames — fun for hype questions." :
                        qType === "slider" ? "Students drag a 0-10 slider — good for 'how likely' questions." :
                        qType === "text" ? "Students type a short answer." :
                        qType === "multi_choice" ? "Students can pick more than one option." :
                        "Students pick one option."
                      }</span>
                    </div>
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

          {draftTemplates.length > 0 && <p className="hint">{draftTemplates.length} draft template{draftTemplates.length === 1 ? " needs" : "s need"} publishing before launch.</p>}
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
                  {t.status === "published" && (
                    <button className="btn btn-primary" onClick={() => goLaunch(t)}>
                      <Icon name="arrow" size={16} /> Launch
                    </button>
                  )}
                </div>
              </div>
              {selectedTemplateId === t.id && (
                t.questions.length === 0 ? <p className="hint" style={{ marginTop: 12 }}>No questions yet. Add a rating, choice, or text question above.</p> :
                t.questions.map((q) => (
                  <div key={q.id} className="item-row">
                    <div className="item-name">
                      {q.position}. {q.prompt}
                      <small>{q.category ? `${q.category} - ` : ""}{q.type}{q.required ? " - required" : ""}{q.help_text ? ` - ${q.help_text}` : ""}{Array.isArray(q.options) && q.options.length ? ` - ${asTextList(q.options)}` : ""}</small>
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
            <h2>Menu stream</h2>
            <p className="hint">LionCafe menus are fed from MJCCv1 in the background. Staff can review what students see, but menu edits stay in the source system.</p>
            <div className="manager-grid" style={{ marginTop: 12 }}>
              <div className="metric-tile">
                <div className="num">{activeCycle ? "Live" : "-"}</div>
                <div className="lbl">MJCCv1 feed</div>
              </div>
              <div className="metric-tile">
                <div className="num">{activeCycle?.days.length ?? 0}/28</div>
                <div className="lbl">Cycle days</div>
              </div>
              <div className="metric-tile">
                <div className="num">{cycles.length}</div>
                <div className="lbl">Stored cycles</div>
              </div>
            </div>
            <div className="sync-banner" style={{ marginTop: 14 }}>
              <div>
                <b>{activeCycle ? activeCycle.title : "No active LionCafe menu feed"}</b>
                <span>
                  {activeCycle
                    ? `${activeCycle.version_label || "Synced from MJCCv1"} - ${activeCycle.days.length}/28 days available`
                    : "The background menu bridge has not populated an active cycle yet."}
                </span>
              </div>
              <span className={`pill ${activeCycle ? "ready" : "collected"}`}>{activeCycle ? "connected" : "waiting"}</span>
            </div>
          </div>

          {cycles.length === 0 && <div className="card"><h2>No menu data yet</h2><p className="hint">The background bridge has not produced a LionCafe cycle in MJCCv2 yet.</p></div>}
          {cycles.map((c) => {
            const displayDays = displayDaysFromCycle(c);
            const weeks = groupMenuWeeks(displayDays);
            const cycleToday = c.id === activeCycle?.id ? activeCycleToday : undefined;
            return (
              <section key={c.id} className="menu-cycle-panel">
                <div className="spread">
                  <div>
                    <h2>{c.title} <span className={`pill ${c.is_active ? "ready" : "collected"}`}>{c.is_active ? "active" : "draft"}</span></h2>
                    <p className="hint" style={{ margin: 0 }}>
                      {c.version_label || "No version"} - {c.days.length}/28 days loaded{c.starts_on ? ` - anchored ${formatMenuDate(c.starts_on)}` : ""}
                    </p>
                  </div>
                </div>
                {weeks.map((week) => (
                  <div key={`${c.id}-${week[0]?.cycleWeek}`} className="menu-week">
                    <div className="menu-week-head">
                      <div>
                        <span className="eyebrow">Week {week[0]?.cycleWeek}</span>
                        <h2>Days {week[0]?.cycleDay}-{week[week.length - 1]?.cycleDay}</h2>
                      </div>
                      <span>{week[0]?.date ? `${formatMenuDate(week[0].date)} - ${formatMenuDate(week[week.length - 1].date)}` : "28-day rotation"}</span>
                    </div>
                    <div className="menu-grid">
                      {week.map((day) => (
                        <StaffMenuDayCard key={day.key} day={day} isToday={day.cycleDay === cycleToday?.cycleDay} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
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
              <div className="field-block">
                <label className="field">Auto-lock</label>
                <select value={launchDuration} onChange={(e) => setLaunchDuration(Number(e.target.value))}>
                  {SESSION_DURATION_OPTIONS.map((option) => (
                    <option key={option.minutes} value={option.minutes}>{option.label}</option>
                  ))}
                </select>
                <div className="input-help"><span>QR links and join codes stop accepting new responses after this time.</span></div>
              </div>
              <button className="btn btn-primary btn-block"><Icon name="arrow" size={16} /> Launch session</button>
            </form>
          </div>

          <div className="card">
            <h2>Post to Student Voice</h2>
            <p className="hint">Use Voice for survey results, special menus, prize bonuses, and MJCC event announcements.</p>
            <form onSubmit={postVoiceAnnouncement} className="stack">
              <div className="row2">
                <div className="field-block">
                  <label className="field">Channel</label>
                  <select value={voiceKind} onChange={(e) => setVoiceKind(e.target.value)}>
                    {VOICE_ANNOUNCEMENT_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>{kind.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field-block">
                  <label className="field">Menu day</label>
                  <select value={voiceDay} onChange={(e) => setVoiceDay(e.target.value === "" ? "" : Number(e.target.value))}>
                    <option value="">Not tied to a menu day</option>
                    {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>Day {i + 1}</option>)}
                  </select>
                </div>
              </div>
              <textarea rows={3} value={voiceBody} onChange={(e) => setVoiceBody(e.target.value)} maxLength={500} placeholder="Example: Double points at dinner tonight, or students rated burrito bowls 4.6/5 this week." />
              <div className="input-help"><span>Posts appear in the student Voice wall.</span><b>{voiceBody.length}/500</b></div>
              <button className="btn btn-solid btn-block"><Icon name="voice" size={16} /> Publish update</button>
            </form>
          </div>

          {sessions.length === 0 && <div className="card"><h2>No sessions launched</h2><p className="hint">Launch a published survey to get a join code and QR students can scan.</p></div>}
          {sessions.map((s) => (
            <div key={s.id} className="card">
              <div className="spread">
                <div>
                  <h2>{s.title} <span className={`pill ${isSessionOpen(s) ? "ready" : "collected"}`}>{isSessionOpen(s) ? "active" : "closed"}</span></h2>
                  <p className="hint" style={{ margin: 0 }}>Code <b className="mono">{s.join_code}</b> - {s.points_reward} pts - {s.survey_templates?.title || "fixed survey"} - {closeText(s.closes_at)} - {sessionResponseCounts.get(s.id) ?? 0} responses</p>
                </div>
                <div className="stack" style={{ alignItems: "flex-end" }}>
                  <button className="btn btn-solid" onClick={() => setShowQr(showQr === s.id ? null : s.id)}>{showQr === s.id ? "Hide QR" : "Show QR"}</button>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <select
                      aria-label={`Duration for ${s.title}`}
                      value={sessionDurationDrafts[s.id] ?? 30}
                      onChange={(e) => setSessionDurationDrafts((current) => ({ ...current, [s.id]: Number(e.target.value) }))}
                    >
                      {SESSION_DURATION_OPTIONS.map((option) => (
                        <option key={option.minutes} value={option.minutes}>{option.label}</option>
                      ))}
                    </select>
                    <button className="btn btn-ghost" onClick={() => setSessionDuration(s)}>Set duration</button>
                  </div>
                  <button className="btn btn-ghost" onClick={() => toggleSession(s)}>{isSessionOpen(s) ? "Close" : "Reopen"}</button>
                </div>
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
          <div className="manager-grid" style={{ marginTop: 12 }}>
            <div className="metric-tile"><div className="num">{resultStats.responses}</div><div className="lbl">Responses</div></div>
            <div className="metric-tile"><div className="num">{resultStats.answers}</div><div className="lbl">Answers</div></div>
            <div className="metric-tile"><div className="num">{resultStats.avg === null ? "-" : resultStats.avg.toFixed(1)}</div><div className="lbl">Avg rating</div></div>
            <div className="metric-tile"><div className="num">{resultStats.textCount}</div><div className="lbl">Open comments</div></div>
          </div>
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
          <div className="field-block" style={{ marginTop: 4 }}>
            <label className="field">Responses per day — last 14 days</label>
            <TrendLine points={resultTrend} height={100} formatLabel={shortDay} />
          </div>
          {resultGroups.length === 0 ? (
            <p className="muted">No dynamic survey answers match this view yet.</p>
          ) : resultGroups.map((g) => {
            const avg = g.ratings.length ? g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length : null;
            const optionItems = Object.entries(g.options)
              .sort((a, b) => b[1] - a[1])
              .map(([label, count]) => ({ label, value: count }));
            const dist = g.ratings.length ? ratingBuckets(g.ratings, g.type) : null;
            return (
              <div key={g.prompt} className="item-row" style={{ alignItems: "flex-start" }}>
                <div className="item-name" style={{ flex: 1 }}>
                  {g.prompt}
                  <small>{g.count} answer{g.count === 1 ? "" : "s"}{avg !== null ? ` · avg ${avg.toFixed(1)}` : ""}</small>
                  {dist && <DistributionColumns buckets={dist.buckets} labels={dist.labels} />}
                  {optionItems.length > 0 && <div style={{ marginTop: 10 }}><Bars items={optionItems} /></div>}
                  {g.texts.slice(0, 4).map((text, i) => <small key={i} className="quote-line">{text}</small>)}
                </div>
                {avg !== null && <span className="avg"><Icon name="star-fill" size={13} /> {avg.toFixed(1)}</span>}
              </div>
            );
          })}
        </div>
      )}
      {tourStep !== null && (
        <div className="tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="content-tour-title">
          <div className="tour-card">
            <div className="tour-progress" aria-label={`Step ${tourStep + 1} of ${CONTENT_TOUR_STEPS.length}`}>
              {CONTENT_TOUR_STEPS.map((_, index) => <span key={index} className={index <= tourStep ? "active" : ""} />)}
            </div>
            <span className="eyebrow">Content Central guide · {tourStep + 1}/{CONTENT_TOUR_STEPS.length}</span>
            <h2 id="content-tour-title">{CONTENT_TOUR_STEPS[tourStep].title}</h2>
            <p>{CONTENT_TOUR_STEPS[tourStep].body}</p>
            <div className="tour-actions">
              <button className="btn btn-ghost" onClick={finishTour}>{tourStep === 0 ? "Skip guide" : "Close"}</button>
              <div>
                {tourStep > 0 && <button className="btn btn-ghost" onClick={() => setTourStep(tourStep - 1)}>Back</button>}
                <button className="btn btn-primary" onClick={() => tourStep === CONTENT_TOUR_STEPS.length - 1 ? finishTour() : setTourStep(tourStep + 1)}>
                  {tourStep === CONTENT_TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
