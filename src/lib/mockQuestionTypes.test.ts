import { test } from "node:test";
import assert from "node:assert/strict";

// The dev mock keeps its state in localStorage; give it an in-memory one, and a fresh copy of the module per seed.
function store(seed?: string) {
  const m = new Map<string, string>(seed ? [["lv.mock.seed", seed]] : []);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
async function mockApi(seed: string | undefined, n: number) {
  store(seed);
  const { createMockTransport } = await import(`./mockTransport.ts?seed=${seed ?? "none"}-${n}`);
  const { createLvApi } = await import("./lvApi.ts");
  return createLvApi(createMockTransport("Dana", () => true));
}
type Api = Awaited<ReturnType<typeof mockApi>>;
async function draft(api: Api, anonymity: "anonymous" | "identified" = "anonymous") {
  await api.myContext();
  const r = await api.quickSurveyCreate("Types", "link", anonymity, true);
  assert.ok(r.ok);
  return r.campaign.campaign_id;
}

test("free: the four new free types work, settings are checked, plus and pro types name the plan", async () => {
  const api = await mockApi(undefined, 1);
  const id = await draft(api);
  assert.equal((await api.kindTier()).ok && (await api.kindTier() as { tier: string }).tier, "free");
  assert.ok((await api.questionAdd(id, 1, "face_scale", "How was it?")).ok);
  assert.ok((await api.questionAdd(id, 2, "dropdown", "Room?", { options: ["A", "B"] })).ok);
  const bad = await api.questionAdd(id, 3, "dropdown", "x", { options: ["A", "a"] });
  assert.ok(!bad.ok && bad.error.code === "lv_invalid_input");
  assert.ok((await api.questionAdd(id, 3, "number", "How many?", { min: 1, max: 5, integer: true })).ok);
  assert.ok((await api.questionAdd(id, 4, "date", "When?")).ok);
  const nps = await api.questionAdd(id, 5, "nps", "Recommend?");
  assert.ok(!nps.ok && nps.error.code === "lv_entitlement_required" && (nps.error as { product?: string }).product === "creator_plus");
  const grid = await api.questionAdd(id, 5, "agree_grid", "Rate", { rows: ["a", "b"] });
  assert.ok(!grid.ok && (grid.error as { product?: string }).product === "creator_pro");
});

test("creator plus unlocks plus types; pro types and quiz scoring still need pro", async () => {
  const api = await mockApi("creator", 2);
  const id = await draft(api);
  assert.equal(((await api.kindTier()) as { tier: string }).tier, "plus");
  assert.ok((await api.questionAdd(id, 1, "nps", "Recommend?")).ok);
  assert.ok((await api.questionAdd(id, 2, "ranking", "Rank", { options: ["a", "b", "c"] })).ok);
  assert.ok((await api.questionAdd(id, 3, "slider", "Spice?", { min: 0, max: 10, step: 1 })).ok);
  assert.ok(!(await api.questionAdd(id, 4, "slider", "Bad", { min: 0, max: 10, step: 3 })).ok);
  assert.ok(!(await api.questionAdd(id, 4, "price_ladder", "Price", { prices: [5, 10] })).ok);
  const q = await api.questionAdd(id, 4, "single_choice", "Capital?", { options: ["Paris", "Rome"] });
  assert.ok(q.ok);
  const quiz = await api.questionUpdate(q.question_id, { config: { options: ["Paris", "Rome"], quiz: { correct: ["Paris"] } } });
  assert.ok(!quiz.ok && quiz.error.code === "lv_entitlement_required");
});

test("creator pro: every type; identity types only on an identified survey; answers are checked per kind", async () => {
  const api = await mockApi("creatorpro", 3);
  const anon = await draft(api, "anonymous");
  assert.equal(((await api.kindTier()) as { tier: string }).tier, "pro");
  const refused = await api.questionAdd(anon, 1, "contact", "Details", { fields: ["name"] });
  assert.ok(!refused.ok && refused.error.code === "lv_invalid_input");
  assert.ok((await api.questionAdd(anon, 1, "agree_grid", "Rate", { rows: ["a", "b"] })).ok);
  assert.ok((await api.questionAdd(anon, 2, "before_after", "Then and now", {})).ok);
  assert.ok((await api.questionAdd(anon, 3, "price_ladder", "Price", { prices: [5, 10] })).ok);
  const ident = await draft(api, "identified");
  assert.ok((await api.questionAdd(ident, 1, "contact", "Details", { fields: ["name", "email"] })).ok);
  assert.ok((await api.questionAdd(ident, 2, "consent", "Agree", { statement: "I agree." })).ok);
  assert.ok((await api.questionAdd(ident, 3, "signature", "Sign", {})).ok);
  assert.ok((await api.questionAdd(ident, 4, "file_upload", "File", { max_mb: 2, types: ["image"] })).ok);
});

test("kindTier follows the survey it is asked about", async () => {
  const api = await mockApi("creator", 4);
  const id = await draft(api);
  const r = await api.kindTier(id);
  assert.ok(r.ok && r.tier === "plus");
  const none = await api.kindTier("nope");
  assert.ok(!none.ok && none.error.code === "lv_not_found");
});
