import { useEffect, useRef, useState, type CSSProperties } from "react";

// The KpnSolute maker's signature is one shared web component — v1.0.0, final —
// served from /brand/kpn-signature@1.js (immutable) and /brand/kpn-signature.js
// (latest). This wrapper only loads it and reserves its box so nothing shifts.
//
// Three modes, all implemented by the component:
//   hero   (default) the tail lands on `target` and the stroke loops in a wave
//   footer draws once when scrolled into view, then rests
//   loader writes, holds, un-writes and loops with role="progressbar"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "kpn-signature": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        target?: string;
        color?: string;
        dot?: string;
        stroke?: string;
        duration?: string;
        period?: string;
        amp?: string;
        tail?: string;
        ghosts?: string;
        mode?: string;
        static?: string;
        label?: string;
        href?: string;
      };
    }
  }
}

let loading: Promise<void> | null = null;

function loadSignature(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("kpn-signature")) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.src = "/brand/kpn-signature@1.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve(); // a missing signature never blocks the page
    document.head.appendChild(script);
  });
  return loading;
}

export type SignatureMode = "hero" | "footer" | "loader";

export function MakerSignature({
  mode = "hero",
  target,
  color,
  still = true,
  href,
  label,
  width = 160,
  height = 52,
  className,
  style,
  tail,
  duration,
  period,
}: {
  mode?: SignatureMode;
  target?: string;
  color?: string;
  still?: boolean;
  href?: string;
  label?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  tail?: number;
  duration?: number;
  period?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    void loadSignature();
  }, []);
  return (
    <div style={{ width, height, position: "relative", ...style }} className={className}>
      <kpn-signature
        ref={ref as never}
        mode={mode}
        target={mode === "hero" ? target : undefined}
        color={color}
        href={href}
        label={label}
        tail={tail !== undefined ? String(tail) : undefined}
        duration={duration !== undefined ? String(duration) : undefined}
        period={period !== undefined ? String(period) : undefined}
        {...(still && mode !== "loader" ? { static: "" } : {})}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

/**
 * The boot screen: the signature writing itself while the app starts. Used by the
 * static shell in index.html and by route Suspense fallbacks, which only show it
 * after 400 ms so a fast load never flashes it.
 */
export function BootLoader({
  delay = 400,
  width = 160,
  height = 64,
  label = "Loading",
}: {
  delay?: number;
  width?: number;
  height?: number;
  label?: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  if (!shown) return null;
  return <MakerSignature mode="loader" label={label} width={width} height={height} color="currentColor" />;
}

/** Replays the drawn signature, e.g. when the hero CTA is clicked. */
export function replaySignature(): void {
  const el = document.querySelector("kpn-signature") as (HTMLElement & { replay?: () => void }) | null;
  el?.replay?.();
}

/** Footer mark: draws once on scroll-in, links to kpnsolute.com, labelled for screen readers. */
export function MakerMark({ href = "https://kpnsolute.com", still = false }: { href?: string; still?: boolean }) {
  return (
    <MakerSignature
      mode="footer"
      href={href}
      label="Made by KpnSolute"
      still={still}
      width={160}
      height={52}
      color="currentColor"
      style={{ opacity: 0.9 }}
    />
  );
}
