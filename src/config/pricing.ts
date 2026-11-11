// Canonical prices and the founder's capability table (master spec 2026-10-25; LAUNCH_PLAN.md founder direction and
// final decisions). Display only: the backend entitlement map (lv_plan_limits) decides what a plan allows. Unknown
// values are never invented here: a number the founder has not fixed is read from the backend map (capabilityRows),
// and its row is left out when the backend has no value either.
// Checkout is disabled everywhere until billing launches (lv_checkout_start fails closed).
import type { Product } from "../lib/lvApi";

export type PlanId = "free" | "campaign_starter" | "campaign_plus" | "starter" | "team" | "reservation";

export interface Plan {
  id: PlanId;
  product: Product | null;
  name: string;
  priceLabel: string;
  cadence: string;
  blurb: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free", product: null, name: "Quick Survey", priceLabel: "$0", cadence: "always free",
    blurb: "Ask a question without making a Hub.",
    features: ["Up to 5 active Quick Surveys", "Up to 10 questions each", "Link, QR, join code or invite only", "Basic totals and charts"],
  },
  {
    id: "campaign_starter", product: "campaign_starter", name: "Campaign Starter", priceLabel: "$19", cadence: "first 2 weeks, then $13 per extra week",
    blurb: "One time-bounded Campaign with Starter features.",
    features: ["Starter features during your paid window", "Pick your own dates", "No subscription"],
  },
  {
    id: "campaign_plus", product: "campaign_plus", name: "Campaign Plus", priceLabel: "$39", cadence: "first 2 weeks, then $19 per extra week",
    blurb: "One time-bounded Campaign with Team features.",
    features: ["Team features during your paid window", "No recurring subscription"],
  },
  {
    id: "starter", product: "starter_hub", name: "Starter Hub", priceLabel: "$13", cadence: "per month",
    blurb: "An ongoing home for one community.",
    features: ["3 custom roles", "3 custom Hub pages", "15 active Campaigns", "2 active surveys", "A survey stops counting toward that limit once more than half your members have answered"],
  },
  {
    id: "team", product: "team_hub", name: "Team Hub", priceLabel: "$29", cadence: "per month",
    blurb: "More roles, pages, modes and analytics.",
    features: ["6 custom roles", "Expanded community pages", "Enhanced Campaign modes", "Advanced targeting and analytics", "5 active surveys", "A survey stops counting toward that limit once 20% of members have answered", "Apply for Discover at 700 active members"],
  },
  {
    id: "reservation", product: "hub_reservation", name: "Reserve your Hub URL", priceLabel: "$25", cadence: "per 12 months, renews at $25",
    blurb: "Hold an address while you plan.",
    features: ["Keeps your address", "25-day grace after expiry, then it is released", "Does not include paid features"],
  },
];

/** The founder's capability table. Column order: the free plan, the highlighted Starter Hub, Team, then the Campaign plans. */
export const CAPABILITY_COLUMNS: { id: PlanId; family: "free" | "starter" | "team"; name: string; price: string; cadence: string; featured?: boolean }[] = [
  { id: "free", family: "free", name: "Free Quick Survey", price: "$0", cadence: "always" },
  { id: "starter", family: "starter", name: "Starter Hub", price: "$13", cadence: "per month", featured: true },
  { id: "team", family: "team", name: "Team Hub", price: "$29", cadence: "per month" },
  { id: "campaign_starter", family: "starter", name: "Campaign Starter", price: "$19", cadence: "2 weeks, then $13/week" },
  { id: "campaign_plus", family: "team", name: "Campaign Plus", price: "$39", cadence: "2 weeks, then $19/week" },
];

type Cell = string | boolean;
type Row = { label: string; cells: [Cell, Cell, Cell, Cell, Cell] };
const STATIC_ROWS: Row[] = [
  { label: "Duration", cells: ["Always", "Monthly", "Monthly", "Your dates", "Your dates"] },
  { label: "Feature family", cells: ["Free", "Starter", "Team", "Starter", "Team"] },
  { label: "Active surveys", cells: ["5 Quick Surveys, up to 10 questions each", "2", "5", "2", "5"] },
  { label: "Custom roles", cells: [false, "3", "6", "3", "6"] },
  { label: "Custom Hub pages", cells: [false, "3", "Expanded", "3", "Expanded"] },
  { label: "When a survey stops counting toward the limit", cells: [false, "Once more than half of members answer", "Once 20% of members answer", "Once more than half of members answer", "Once 20% of members answer"] },
  { label: "Members, roles and Hub pages", cells: [false, true, true, "During your window", "During your window"] },
  { label: "Link, QR and join code", cells: [true, true, true, true, true] },
  { label: "Invite-only access", cells: [true, true, true, true, true] },
  { label: "Anonymous or identified", cells: [true, true, true, true, true] },
  { label: "Results", cells: ["Totals and charts", "Starter analytics", "Advanced analytics", "Starter analytics", "Advanced analytics"] },
  { label: "Export of released results", cells: [false, true, true, true, true] },
  { label: "Advanced role targeting", cells: [false, false, true, false, true] },
  { label: "Discover listing", cells: [false, false, "Apply at 700 members", false, false] },
  { label: "Branding", cells: ["LunchVoice", "Your Hub color", "Your Hub color", "As Starter Hub", "As Team Hub"] },
];

/** lv_plan_limits().families: the backend entitlement map, keyed by family then limit key. */
type Families = Partial<Record<"free" | "starter" | "team", Record<string, number | null>>>;

/**
 * The compare rows. "Active Campaigns" has no founder-fixed number for the Team family, so it is not written here:
 * the row is built from the backend map (campaigns.max_active) and left out until every paid plan has a value.
 * Quick Surveys are not Hub Campaigns, so the free column is a dash.
 */
export function capabilityRows(families?: Families | null): Row[] {
  const cells = CAPABILITY_COLUMNS.map((c) => (c.family === "free" ? false : families?.[c.family]?.["campaigns.max_active"] ?? null));
  if (cells.some((v) => v === null)) return STATIC_ROWS;
  const row: Row = { label: "Active Campaigns at once", cells: cells.map((v) => (v === false ? false : String(v))) as Row["cells"] };
  const at = STATIC_ROWS.findIndex((r) => r.label === "Active surveys") + 1;
  return [...STATIC_ROWS.slice(0, at), row, ...STATIC_ROWS.slice(at)];
}

export const CHECKOUT_DISABLED_REASON =
  "Billing opens soon. Nothing can be bought yet. Founding seats keep Starter features free until 30 days after billing opens.";

/** Founder's pricing notes, shown on /pricing. */
export const PRICING_NOTES = [
  "Prices exclude applicable tax.",
  "Cancel a Hub plan anytime; access continues to the end of the paid period.",
  "Campaign plans are refundable until the Campaign window starts.",
];
