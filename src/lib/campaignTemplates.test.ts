import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_TEMPLATES, campaignTemplateById, groupOf, templateOffered, usesSurveySlot } from "../config/campaignTemplates.ts";
import { templateConfig } from "../config/surveyTemplates.ts";
import { questionConfigProblem } from "./lvApi.ts";

test("ids are unique and URL-safe", () => {
  const ids = CAMPAIGN_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("every template is complete and valid under the server's question rules", () => {
  for (const t of CAMPAIGN_TEMPLATES) {
    assert.ok(t.title.trim() && t.title.length <= 120, `${t.id}: title`);
    assert.ok(t.description.trim() && t.description.length <= 2000, `${t.id}: description`);
    assert.ok(t.focus.trim() && t.blurb.trim() && t.uses.length >= 1, `${t.id}: copy`);
    assert.ok(t.questions.length >= 1, `${t.id}: questions`);
    const prompts = t.questions.map((q) => q.prompt.toLowerCase());
    assert.equal(new Set(prompts).size, prompts.length, `${t.id}: unique prompts`);
    for (const q of t.questions) assert.equal(questionConfigProblem(q.kind, templateConfig(q)), null, `${t.id}: "${q.prompt}"`);
  }
});

test("a poll, rating or feedback template is a single question; only a survey has several", () => {
  for (const t of CAMPAIGN_TEMPLATES) {
    if (t.mode === "survey") assert.ok(t.questions.length >= 3, `${t.id}: a survey has several questions`);
    else assert.equal(t.questions.length, 1, `${t.id}: a ${t.mode} is one question`);
  }
  for (const t of CAMPAIGN_TEMPLATES.filter((x) => x.mode === "rating")) assert.equal(t.questions[0]!.kind, "rating", t.id);
  for (const t of CAMPAIGN_TEMPLATES.filter((x) => x.mode === "feedback")) assert.equal(t.questions[0]!.kind, "text", t.id);
});

test("role targeting is a Team feature and needs identified answers (FB-01); its templates say so", () => {
  const targeted = CAMPAIGN_TEMPLATES.filter((t) => t.targetsRoles);
  assert.ok(targeted.length >= 4);
  for (const t of targeted) {
    assert.equal(t.plan, "team", `${t.id}: role targeting needs the Team family`);
    assert.equal(t.anonymity, "identified", `${t.id}: a role-targeted Campaign cannot be anonymous`);
    assert.ok(t.uses.some((u) => /role targeting/i.test(u)), `${t.id}: says it uses role targeting`);
  }
});

test("an anonymous template never claims to be anonymous while naming who answered", () => {
  for (const t of CAMPAIGN_TEMPLATES.filter((x) => x.anonymity === "identified")) {
    assert.ok(!/answers are anonymous/i.test(t.description), t.id);
  }
});

test("the Starter group leans on polls, ratings and feedback, which do not use the 2 survey slots", () => {
  const starter = CAMPAIGN_TEMPLATES.filter((t) => groupOf(t) === "starter");
  assert.ok(starter.length >= 5);
  assert.ok(starter.filter((t) => !usesSurveySlot(t)).length > starter.filter(usesSurveySlot).length, "most Starter templates are not surveys");
  for (const t of starter.filter(usesSurveySlot)) assert.ok(t.uses.some((u) => /survey/i.test(u)), `${t.id}: says it uses a survey slot`);
});

test("time-bounded templates have a sensible window and say when they close", () => {
  const windowed = CAMPAIGN_TEMPLATES.filter((t) => groupOf(t) === "window");
  assert.ok(windowed.length >= 4);
  for (const t of windowed) {
    assert.ok(t.windowDays! >= 1 && t.windowDays! <= 60, `${t.id}: window`);
    assert.ok(t.uses.some((u) => u.includes(`${t.windowDays} days`)), `${t.id}: says it closes after ${t.windowDays} days`);
  }
  assert.ok(windowed.some((t) => t.plan === "team"), "there is a Campaign Plus (Team features) window template");
  assert.ok(windowed.some((t) => t.plan === "starter"), "there are Campaign Starter window templates");
});

test("each plan group is represented", () => {
  for (const g of ["starter", "team", "window"] as const) assert.ok(CAMPAIGN_TEMPLATES.some((t) => groupOf(t) === g), g);
});

test("offering is display-only: Team templates need an active Team family, everything else is open", () => {
  const team = campaignTemplateById("role-pulse")!;
  const starter = campaignTemplateById("weekly-poll")!;
  assert.equal(templateOffered(team, { family: "team", state: "active" }), true);
  assert.equal(templateOffered(team, { family: "starter", state: "active" }), false);
  assert.equal(templateOffered(team, { family: "team", state: "expired" }), false);
  assert.equal(templateOffered(team, null), false);
  assert.equal(templateOffered(starter, { family: "starter", state: "active" }), true);
  assert.equal(templateOffered(starter, null), true, "a draft can always be started");
});
