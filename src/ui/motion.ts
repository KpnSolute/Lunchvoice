import { useEffect, useRef, useState } from "react";

// The one motion system. Every animation in the app is one of these: press,
// select-jelly, switch/thumb stretch-slide, popover, page enter, scroll reveal,
// ticker, live dot, count-up. Nothing else may animate.

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Re-triggers `jelly` when the value changes. Returns the class to apply. */
export function useJelly<T>(value: T): { className: string; onAnimationEnd: () => void } {
  const [play, setPlay] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced()) return;
    setPlay(true);
  }, [value]);
  return { className: play ? "jelly" : "", onAnimationEnd: () => setPlay(false) };
}

/** Counts a metric up once, when it first enters view. */
export function useCountUp(target: number, ms = 600): number {
  const [value, setValue] = useState(() => (reduced() ? target : 0));
  const ref = useRef<boolean>(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    if (reduced()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // easeOutCubic, the same curve family as --lv-ease
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Marketing-only scroll reveal: 12px rise, once. */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return { ref, shown };
}

/** Staggers page-enter blocks, max 6, 40ms apart. */
export function usePageEnter(key: string) {
  const [k, setK] = useState(key);
  useEffect(() => {
    if (k !== key) setK(key);
  }, [key, k]);
  return `stagger rise-${k ? "on" : "off"}`;
}

/** Pauses the ticker when it is off-screen or the tab is hidden. */
export function useTickerPause<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onVis = () => setPaused(document.hidden);
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((es) => {
            for (const e of es) setPaused(!e.isIntersecting || document.hidden);
          });
    io?.observe(el);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return { ref, paused };
}

/** Rotating proof line: fade/slide every 3.2s, honours reduced motion. */
export function useRotator(length: number, ms = 3200): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (length < 2 || reduced()) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => window.clearInterval(t);
  }, [length, ms]);
  return i;
}

/** Runs `fn` on navigation; uses the View Transitions API when available. */
export function withViewTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (reduced() || !doc.startViewTransition) {
    fn();
    return;
  }
  doc.startViewTransition(fn);
}
