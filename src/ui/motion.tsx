import { useEffect, useRef, useState } from "react";

/** True when the person asked for reduced motion: animations become instant state changes. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Count from the previous value to `target` over 600ms (ease-out). Instant with reduced motion. */
export function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(shown);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - k) ** 3;
      const v = Math.round(a + (target - a) * eased);
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/** A number that counts up when it first appears or changes. Screen readers get the final value only. */
export function CountUp({ value }: { value: number }) {
  const shown = useCountUp(value);
  return (
    <span className="lv-countup">
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
