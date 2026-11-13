// Results privacy by plan (000053), against the dev mock, which mirrors the server rules: Creator Plus sees results and
// individual responses live (anonymous too, with no names or times); a free creator still waits; the respondent is told.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

async function publish(page, go, { title, identified }) {
  await go("/surveys/new");
  await page.getByLabel("Title").fill(title);
  if (identified) await page.getByRole("radio", { name: /^Identified/ }).click();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Favourite team?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Reds");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Blues");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("publish").click();
  return (await page.getByTestId("share").getByText(/^[A-Z0-9]{6}$/).first().innerText()).trim();
}

// Two answers, one from a signed-in member and one from a guest, written into the mock state.
async function addAnswers(page, identified) {
  await page.evaluate((ident) => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns[st.campaigns.length - 1];
    const q = c.questions[0].question_id;
    const at = new Date(Date.now() - 3 * 3600_000).toISOString();
    c.responses.push({ receipt: "r-a", answers: [{ question_id: q, value: "Reds" }], at, guest: false, name: ident ? "Maurice" : undefined });
    c.responses.push({ receipt: "r-b", answers: [{ question_id: q, value: "Blues" }], at, guest: true, name: ident ? "Visitor" : undefined });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  }, identified);
  await page.reload();
}

async function openResults(page, go, title) {
  await go("/surveys");
  await page.getByText(title).first().click();
  await page.getByRole("link", { name: /Results/ }).first().click();
}

test("Creator Plus: an anonymous survey shows totals and 2 individual responses live, with no names or times", async () => {
  const { page, go } = await openPage(app, { width: 1280, seed: "creator" });
  await publish(page, go, { title: "Plus anon", identified: false });
  await addAnswers(page, false);
  await openResults(page, go, "Plus anon");
  await page.getByTestId("live-note").waitFor();
  const card = page.getByTestId("anon-responses");
  await card.waitFor();
  await page.getByTestId("anon-response-row").first().waitFor();
  assert.equal(await page.getByTestId("anon-response-row").count(), 2);
  const text = await card.innerText();
  assert.ok(/Reds/.test(text) && /Blues/.test(text), "both answers are listed");
  assert.ok(!/Maurice|Visitor|Dana|Account|Guest|AM|PM|20\d\d/.test(text.replace(/Individual responses|Opening this list is recorded\./g, "")), `no name or time in: ${text}`);
  assert.equal(await page.getByTestId("question-withheld").count(), 0, "nothing is withheld");
  assert.equal(await page.getByTestId("live-upsell").count(), 0);
  await page.getByText("2 responses").first().waitFor();
});

test("Free creator: an anonymous survey still waits and offers Creator Plus quietly", async () => {
  const { page, go } = await openPage(app, { width: 1280, seed: "demo" });
  await publish(page, go, { title: "Free anon", identified: false });
  await addAnswers(page, false);
  await openResults(page, go, "Free anon");
  await page.getByTestId("live-upsell").waitFor();
  assert.ok(/Creator Plus/.test(await page.getByTestId("live-upsell").innerText()));
  assert.equal(await page.getByTestId("anon-responses").count(), 0);
  assert.equal(await page.getByTestId("live-note").count(), 0);
});

test("The respondent of an anonymous survey is told the creator sees results as they come in (Creator Plus only)", async () => {
  const plus = await openPage(app, { width: 390, seed: "creator" });
  const code = await publish(plus.page, plus.go, { title: "Notice plus", identified: false });
  await plus.go(`/c/${code}`);
  await plus.page.getByTestId("results-live-note").waitFor();
  assert.ok(/results as they come in/.test(await plus.page.getByTestId("results-live-note").innerText()));
  assert.ok(/not linked/.test(await plus.page.getByTestId("results-live-note").innerText()));

  const free = await openPage(app, { width: 390, seed: "demo" });
  const code2 = await publish(free.page, free.go, { title: "Notice free", identified: false });
  await free.go(`/c/${code2}`);
  await free.page.getByTestId("player-start").waitFor();
  assert.equal(await free.page.getByTestId("results-live-note").count(), 0);
});

test("Creator Plus: an identified survey keeps names and tags in its Responses list", async () => {
  const { page, go } = await openPage(app, { width: 1280, seed: "creator" });
  await publish(page, go, { title: "Plus named", identified: true });
  await addAnswers(page, true);
  await openResults(page, go, "Plus named");
  const card = page.getByTestId("responses");
  await card.waitFor();
  await page.getByTestId("response-row").first().waitFor();
  const text = await card.innerText();
  assert.ok(/Maurice/.test(text) && /Visitor/.test(text) && /Guest, unverified/.test(text), text);
  assert.equal(await page.getByTestId("anon-responses").count(), 0);
});
