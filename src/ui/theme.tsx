import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Light and dark follow the machine. There is no in-app theme switch: the page and
// ink colours are decided by `prefers-color-scheme` and change live when the OS does.
// High contrast is a separate accessibility treatment and stays a user choice.
//
// The same resolution runs in the inline script in index.html so the first paint
// already has the right tokens; keep the two in sync.

export type Contrast = "normal" | "high";

const CONTRAST_KEY = "lv.contrast";

interface ThemeApi {
  resolved: "light" | "dark";
  contrast: Contrast;
  setContrast: (c: Contrast) => void;
}

const Ctx = createContext<ThemeApi | null>(null);

function readContrast(): Contrast {
  try {
    return localStorage.getItem(CONTRAST_KEY) === "high" ? "high" : "normal";
  } catch {
    return "normal";
  }
}

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [contrast, setContrastState] = useState<Contrast>(readContrast);
  const [dark, setDark] = useState(prefersDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.contrast = contrast === "high" ? "high" : "normal";
    root.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#17140F" : "#EEEDEA");
  }, [dark, contrast]);

  const setContrast = useCallback((c: Contrast) => {
    setContrastState(c);
    try {
      localStorage.setItem(CONTRAST_KEY, c);
    } catch {
      /* storage unavailable: applies to this page only */
    }
  }, []);

  const value = useMemo<ThemeApi>(
    () => ({ resolved: dark ? "dark" : "light", contrast, setContrast }),
    [dark, contrast, setContrast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
