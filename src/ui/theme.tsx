import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Appearance is machine-set, never user-set. Two palettes exist and the machine's own
// light/dark preference decides which one the page is written in:
//
//   page — light. Paper-cream page, ink text.  (prefers-color-scheme: light, the default)
//   ink  — dark.  Ink page, paper text.        (prefers-color-scheme: dark)
//
// There is no stored theme, no switch and no override: when the OS changes, the page
// changes with it. High contrast is not a third palette either — it is a border-and-ink
// treatment that CSS applies from `prefers-contrast: more`.
//
// The inline script in index.html resolves the same value before first paint so nobody
// sees a flash of the wrong palette; keep the two in sync.

export type Appearance = "page" | "ink";

interface ThemeApi {
  /** The palette the machine is asking for right now. */
  appearance: Appearance;
}

const Ctx = createContext<ThemeApi | null>(null);

function machineWantsInk(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = appearance;
  root.style.colorScheme = appearance === "ink" ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", appearance === "ink" ? "#17140F" : "#EEEDEA");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(() => (machineWantsInk() ? "ink" : "page"));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setAppearance(mq.matches ? "ink" : "page");
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  const value = useMemo<ThemeApi>(() => ({ appearance }), [appearance]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
