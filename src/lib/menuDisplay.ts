import { CYCLE, weekdayFor } from "./menu";
import { mealItems, type PublicMenuCycle, type PublicMenuDay } from "./mjccMenuApi";
import type { MenuCycle, MenuCycleDay } from "../types/db";

export type DisplayMenuDay = {
  key: string;
  cycleDay: number;
  cycleWeek: number;
  weekday: string;
  date?: string;
  breakfast: string[];
  lunch: string[];
  dinner: string[];
  feedback?: PublicMenuDay["feedback"];
};

export type MealPeriod = {
  key: "breakfast" | "lunch" | "dinner";
  label: "Breakfast" | "Lunch" | "Dinner";
  starts: number;
  ends: number;
  hours: string;
};

export const MEAL_PERIODS: MealPeriod[] = [
  { key: "breakfast", label: "Breakfast", starts: 6.5, ends: 7.75, hours: "6:30 - 7:45 AM" },
  { key: "lunch", label: "Lunch", starts: 11, ends: 13, hours: "11:00 AM - 1:00 PM" },
  { key: "dinner", label: "Dinner", starts: 16.5, ends: 18, hours: "4:30 - 6:00 PM" },
];

export function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean) : [];
}

export function addDays(date: string, days: number): string | undefined {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function formatMenuDate(date?: string): string {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function displayDaysFromApi(cycle: PublicMenuCycle): DisplayMenuDay[] {
  return [...cycle.days]
    .sort((a, b) => a.cycle_day - b.cycle_day)
    .map((day) => ({
      key: `api-${day.cycle_day}`,
      cycleDay: day.cycle_day,
      cycleWeek: day.cycle_week ?? Math.ceil(day.cycle_day / 7),
      weekday: day.day_of_week || weekdayFor(day.cycle_day - 1),
      date: day.date ?? addDays(cycle.anchor_date, day.cycle_day - 1),
      breakfast: mealItems(day, ["Breakfast", "Brunch"]),
      lunch: mealItems(day, ["Lunch", "Brunch"]),
      dinner: mealItems(day, ["Dinner"]),
      feedback: day.feedback,
    }));
}

export function displayDaysFromCycle(cycle: MenuCycle & { days: MenuCycleDay[] }): DisplayMenuDay[] {
  return [...cycle.days]
    .sort((a, b) => a.day_number - b.day_number)
    .map((day) => ({
      key: day.id,
      cycleDay: day.day_number,
      cycleWeek: Math.ceil(day.day_number / 7),
      weekday: day.weekday || weekdayFor(day.day_number - 1),
      date: cycle.starts_on ? addDays(cycle.starts_on, day.day_number - 1) : undefined,
      breakfast: textList(day.breakfast),
      lunch: textList(day.lunch),
      dinner: textList(day.dinner),
    }));
}

export function displayDaysFromStatic(): DisplayMenuDay[] {
  return CYCLE.map(([lunch, lunchAlt, dinner, dinnerAlt], i) => ({
    key: `static-${i + 1}`,
    cycleDay: i + 1,
    cycleWeek: Math.ceil((i + 1) / 7),
    weekday: weekdayFor(i),
    lunch: [lunch, lunchAlt].filter(Boolean),
    dinner: [dinner, dinnerAlt].filter(Boolean),
    breakfast: [],
  }));
}

export function groupMenuWeeks(days: DisplayMenuDay[]): DisplayMenuDay[][] {
  const groups = new Map<number, DisplayMenuDay[]>();
  for (const day of days) {
    const week = day.cycleWeek || Math.ceil(day.cycleDay / 7);
    groups.set(week, [...(groups.get(week) ?? []), day]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value.sort((a, b) => a.cycleDay - b.cycleDay));
}

export function currentMealPeriod(now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60;
  const open = MEAL_PERIODS.find((period) => hour >= period.starts && hour < period.ends);
  if (open) return { period: open, status: "Open now" };
  const upcoming = MEAL_PERIODS.find((period) => hour < period.starts);
  if (upcoming) return { period: upcoming, status: "Next up" };
  return { period: MEAL_PERIODS[MEAL_PERIODS.length - 1], status: "Closed for today" };
}

export function mealItemsForPeriod(day: DisplayMenuDay | null | undefined, periodKey: MealPeriod["key"]): string[] {
  if (!day) return [];
  return day[periodKey];
}
