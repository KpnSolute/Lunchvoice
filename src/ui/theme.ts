// Theme preference: light, dark, high contrast, or follow the system. Saved on this device only.
// The same logic runs before first paint from index.html so there is no flash of the wrong theme.
export type ThemePref = "system" | "light" | "dark" | "hc";
export type ResolvedTheme = "light" | "dark" | "hc";

export const THEME_KEY = "lv.theme";
export const THEME_PREFS: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "hc", label: "High contrast" },
];

const isPref = (value: unknown): value is ThemePref => THEME_PREFS.some((p) => p.id === value);

export function readThemePref(): ThemePref {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isPref(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === "system") return systemDark ? "dark" : "light";
  return pref;
}

const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#EEEDEA", dark: "#17140F", hc: "#FFFFFF" };

export function applyThemePref(pref: ThemePref): ResolvedTheme {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(pref, systemDark);
  document.documentElement.setAttribute("data-theme", resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolved]);
  return resolved;
}

export function saveThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode: the choice still applies for this visit */
  }
  applyThemePref(pref);
}

/** Apply the saved preference and follow the system while the preference is "system". */
export function initTheme(): void {
  applyThemePref(readThemePref());
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (readThemePref() === "system") applyThemePref("system");
    });
}
