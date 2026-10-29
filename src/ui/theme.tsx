import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Light, dark and high contrast (spec §14). The choice is a user setting saved in
// localStorage; "system" follows prefers-color-scheme live. The same key is read by
// the inline no-flash script in index.html, so keep the names in sync.

export type ThemeMode = "light" | "dark" | "system";
export type Contrast = "normal" | "high";

const MODE_KEY = "lv.theme";
const CONTRAST_KEY = "lv.contrast";

interface ThemeApi {
  mode: ThemeMode;
  resolved: "light" | "dark";
  contrast: Contrast;
  setMode: (m: ThemeMode) => void;
  setContrast: (c: Contrast) => void;
}

const Ctx = createContext<ThemeApi | null>(null);

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function readContrast(): Contrast {
  try {
    return localStorage.getItem(CONTRAST_KEY) === "high" ? "high" : "normal";
  } catch {
    return "normal";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [contrast, setContrastState] = useState<Contrast>(readContrast);
  const [dark, setDark] = useState(() => (readMode() === "dark" ? true : readMode() === "light" ? false : systemDark()));

  useEffect(() => {
    if (mode !== "system") {
      setDark(mode === "dark");
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.contrast = contrast === "high" ? "high" : "normal";
    root.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#17140F" : "#EEEDEA");
  }, [dark, contrast]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* storage unavailable: applies to this page only */
    }
  }, []);

  const setContrast = useCallback((c: Contrast) => {
    setContrastState(c);
    try {
      localStorage.setItem(CONTRAST_KEY, c);
    } catch {
      /* storage unavailable: applies to this page only */
    }
  }, []);

  const value = useMemo<ThemeApi>(
    () => ({ mode, resolved: dark ? "dark" : "light", contrast, setMode, setContrast }),
    [mode, dark, contrast, setMode, setContrast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
