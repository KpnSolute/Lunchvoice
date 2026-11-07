// Canonical prices and the founder's capability table (master spec 2026-10-25; LAUNCH_PLAN.md founder direction and
// final decisions). Display only: the backend entitlement map (lv_plan_limits) decides what a plan allows. Unknown
// values stay unknown: the Team overall active-Campaign limit is not set by the founder.
// Checkout is disabled everywhere until billing launches (lv_checkout_start fails closed).
import type { Product } from "../lib/lvApi";

export type PlanId = "free" | "campaign_starter" | "campaign_plus" | "starter" | "team" | "reservation";

export interface Plan {
  id: PlanId;
  product: Product | null;
  name: string;
  /** null = no authoritative price: show "Price not set", never a number. */
  priceLabel: string | null;
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
    features: ["3 custom roles", "3 custom Hub pages", "15 active Campaigns", "2 active surveys", "Replace a survey after more than 50% participation"],
  },
  {
    id: "team", product: "team_hub", name: "Team Hub", priceLabel: "$29", cadence: "per month",
    blurb: "More roles, pages, modes and analytics.",
    features: ["6 custom roles", "Expanded community pages", "Enhanced Campaign modes", "Advanced targeting and analytics", "5 active surveys", "Replace a survey at 20% participation or more", "Apply for Discover at 700 active members"],
  },
  {
    id: "reservation", product: "hub_reservation", name: "Reserve your Hub URL", priceLabel: "$25", cadence: "per 12 months, renews at $25",
    blurb: "Hold an address while you plan.",
    features: ["Keeps your address", "25-day grace after expiry, then it is released", "Does not include paid features"],
  },
];

/** The founder's capability table, column order fixed. `null` cells render as "Not set yet". */
export const CAPABILITY_COLUMNS: { id: PlanId; name: string; price: string | null; cadence: string; featured?: boolean }[] = [
  { id: "free", name: "Free Quick Survey", price: "$0", cadence: "always" },
  { id: "campaign_starter", name: "Campaign Starter", price: "$19", cadence: "2 weeks, then $13/week" },
  { id: "campaign_plus", name: "Campaign Plus", price: "$39", cadence: "2 weeks, then $19/week" },
  { id: "starter", name: "Starter Hub", price: "$13", cadence: "per month", featured: true },
  { id: "team", name: "Team Hub", price: "$29", cadence: "per month" },
];

type Cell = string | boolean | null;
export const CAPABILITY_ROWS: { label: string; cells: [Cell, Cell, Cell, Cell, Cell] }[] = [
  { label: "Duration", cells: ["Always", "Your dates", "Your dates", "Monthly", "Monthly"] },
  { label: "Feature family", cells: ["Free", "Starter", "Team", "Starter", "Team"] },
  { label: "Active surveys", cells: ["5 Quick Surveys, up to 10 questions each", "2", "5", "2", "5"] },
  { label: "Active Campaigns overall", cells: [null, "15", null, "15", null] },
  { label: "Custom roles", cells: [false, "3", "6", "3", "6"] },
  { label: "Custom Hub pages", cells: [false, "3", "Expanded", "3", "Expanded"] },
  { label: "Survey replacement threshold", cells: [false, "More than 50%", "20% or more", "More than 50%", "20% or more"] },
  { label: "Members, roles and Hub pages", cells: [false, "During your window", "During your window", true, true] },
  { label: "Link, QR and join code", cells: [true, true, true, true, true] },
  { label: "Invite-only access", cells: [true, true, true, true, true] },
  { label: "Anonymous or identified", cells: [true, true, true, true, true] },
  { label: "Results", cells: ["Totals and charts", "Starter analytics", "Advanced analytics", "Starter analytics", "Advanced analytics"] },
  { label: "Export of released results", cells: [false, true, true, true, true] },
  { label: "Advanced role targeting", cells: [false, false, true, false, true] },
  { label: "Discover listing", cells: [false, false, false, false, "Apply at 700 members"] },
  { label: "Branding", cells: ["LunchVoice", "As Starter Hub", "As Team Hub", "Your Hub color", "Your Hub color"] },
];

export const CHECKOUT_DISABLED_REASON =
  "Billing opens soon. Nothing can be bought yet. Founding seats keep Starter features free until 30 days after billing opens.";

/** Founder's pricing notes, shown on /pricing. */
export const PRICING_NOTES = [
  "Prices exclude applicable tax.",
  "Cancel a Hub plan anytime; access continues to the end of the paid period.",
  "Campaign plans are refundable until the Campaign window starts.",
];
