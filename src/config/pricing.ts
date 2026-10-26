// Canonical prices (master spec 2026-10-25). Display only: the backend entitlement map decides
// what a plan allows. Campaign Plus has no numeric price yet: never invent one, and keep its
// checkout disabled (`priceCents: null`).
export interface Plan {
  id: "free" | "starter" | "team" | "campaign_starter" | "campaign_plus" | "reservation";
  name: string;
  priceLabel: string | null;
  cadence: string;
  features: string[];
  checkoutEnabled: boolean;
}

export const PLANS: Plan[] = [
  { id: "free", name: "Participant", priceLabel: "$0", cadence: "always", features: ["Account and sign-in", "Join authorized Hubs", "Answer Campaigns"], checkoutEnabled: false },
  {
    id: "starter", name: "Starter Hub", priceLabel: "$13", cadence: "per month", checkoutEnabled: false,
    features: ["3 custom roles", "3 custom Hub pages", "15 active Campaigns", "2 active surveys", "Replace a survey after more than 50% participation"],
  },
  {
    id: "team", name: "Team Hub", priceLabel: "$29", cadence: "per month", checkoutEnabled: false,
    features: ["6 custom roles", "Expanded community pages", "Enhanced Campaign modes", "Advanced targeting and analytics", "5 active surveys", "Replace a survey at 20% participation or more", "Apply for Discover at 700 active members"],
  },
  {
    id: "campaign_starter", name: "Campaign Starter", priceLabel: "$19", cadence: "first 2 weeks, then $13 per extra week", checkoutEnabled: false,
    features: ["Starter features during your paid window", "Pick your own dates"],
  },
  {
    id: "campaign_plus", name: "Campaign Plus", priceLabel: null, cadence: "pricing coming soon", checkoutEnabled: false,
    features: ["Team features during your paid window", "No recurring subscription"],
  },
  {
    id: "reservation", name: "Reserve your Hub URL", priceLabel: "$25", cadence: "per 12 months, renews at $25", checkoutEnabled: false,
    features: ["Keeps your address while you plan", "25-day grace after expiry, then it is released", "Does not include paid features"],
  },
];
