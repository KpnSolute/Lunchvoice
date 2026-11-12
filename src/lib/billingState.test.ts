import test from "node:test";
import assert from "node:assert/strict";
import { BILLING_CLOSED, billingReason, billingState, headerCta, planAction, siteCtas } from "./billingState";

const OPEN = billingState({ open: true, launch_at: "2026-12-01T00:00:00Z", founding_ends_at: "2026-12-31T00:00:00Z" });

test("unknown billing state is closed (fail closed)", () => {
  assert.deepEqual(billingState(undefined), BILLING_CLOSED);
  assert.deepEqual(billingState(null, null), BILLING_CLOSED);
  assert.equal(billingState({ open: false, launch_at: null, founding_ends_at: null }, false).open, false);
});

test("either lv_api source can open it", () => {
  assert.equal(billingState({ open: true, launch_at: null, founding_ends_at: null }).open, true);
  assert.equal(billingState(undefined, true).open, true); // signed in, before 000035 is applied
});

test("Start a free survey is the primary action in both states", () => {
  for (const s of [BILLING_CLOSED, OPEN]) assert.deepEqual(siteCtas(s).primary, { label: "Start a free survey", to: "/surveys/new" });
});

test("closed: waitlist wording everywhere, and nothing says buy", () => {
  const c = siteCtas(BILLING_CLOSED);
  assert.deepEqual(c.hub, { label: "Join the waitlist", to: "/waitlist" });
  assert.equal(c.noticeTitle, "Billing opens soon");
  assert.match(c.sentence, /nothing here charges money/);
  assert.match(c.reason, /Nothing can be bought yet/);
  for (const signedIn of [true, false]) {
    assert.equal(planAction(BILLING_CLOSED, signedIn, "starter_hub", true), "waitlist");
    for (const p of ["team_hub", "campaign_starter", "campaign_plus"]) assert.equal(planAction(BILLING_CLOSED, signedIn, p, true), "closed");
  }
});

test("closed with a launch date: the date is stated", () => {
  const s = billingState({ open: false, launch_at: "2026-12-01T12:00:00Z", founding_ends_at: "2026-12-31T12:00:00Z" });
  assert.match(siteCtas(s).noticeTitle, /^Billing opens .*2026/);
  assert.match(siteCtas(s).sentence, /2026/);
  assert.match(billingReason({ open: false, launch_at: "2026-12-01T12:00:00Z", founding_ends_at: null }), /30 days after billing opens/);
});

test("open: Create your Hub goes to the purchase path", () => {
  const c = siteCtas(OPEN);
  assert.deepEqual(c.hub, { label: "Create your Hub", to: "/pricing" });
  assert.equal(c.noticeTitle, "Checkout is open");
  assert.equal(c.reason, "");
  assert.doesNotMatch(c.sentence, /waitlist|opens/i);
});

test("open: signed out signs in first; signed in buys only what is on sale", () => {
  assert.equal(planAction(OPEN, false, "starter_hub", false), "signin");
  assert.equal(planAction(OPEN, true, "starter_hub", true), "buy");
  assert.equal(planAction(OPEN, true, "campaign_plus", false), "closed");
});

test("the header button follows the same state and hides on /waitlist and /signin", () => {
  assert.deepEqual(headerCta(BILLING_CLOSED, "/"), { label: "Join the waitlist", to: "/waitlist" });
  assert.deepEqual(headerCta(OPEN, "/pricing"), { label: "Create your Hub", to: "/pricing" });
  for (const s of [BILLING_CLOSED, OPEN]) for (const p of ["/waitlist", "/signin"]) assert.equal(headerCta(s, p), null);
});
