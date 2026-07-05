const DEFAULT_MJCC_API_BASE = "https://mjcc-managements.onrender.com";

const baseUrl = (import.meta.env.VITE_MJCC_MENU_API_BASE || DEFAULT_MJCC_API_BASE).replace(/\/$/, "");

export type PublicMenuSlot = {
  slot_name: string;
  item_name: string;
};

export type PublicMenuDay = {
  date?: string;
  cycle_day: number;
  cycle_week?: number;
  day_of_week: string;
  meals: Record<string, PublicMenuSlot[]>;
  feedback?: PublicMenuStat[];
};

export type PublicMenuCycle = {
  anchor_date: string;
  days: PublicMenuDay[];
};

export type PublicMenuStat = {
  id?: string;
  cycle_day: number;
  slot: string;
  dish_name: string;
  avg_rating: number | null;
  response_count: number;
  updated_at: string;
};

export type PublicMenuStats = {
  rows: PublicMenuStat[];
  top_meals: PublicMenuStat[];
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`MJCC API ${res.status}`);
  return res.json() as Promise<T>;
}

export function getPublicMenuToday() {
  return getJson<PublicMenuDay>("/api/public/menu/today");
}

export function getPublicMenuCycle(includeStats = false) {
  return getJson<PublicMenuCycle>(`/api/public/menu/cycle${includeStats ? "?include_stats=true" : ""}`);
}

export function getPublicMenuStats(limit = 10) {
  return getJson<PublicMenuStats>(`/api/public/menu/stats?limit=${limit}`);
}

export function mealItems(day: PublicMenuDay | null | undefined, periods: string[]): string[] {
  if (!day) return [];
  return periods.flatMap((period) => day.meals[period] ?? []).map((slot) => slot.item_name).filter(Boolean);
}

export function firstMealItem(day: PublicMenuDay | null | undefined, periods: string[]): string | undefined {
  return mealItems(day, periods)[0];
}
