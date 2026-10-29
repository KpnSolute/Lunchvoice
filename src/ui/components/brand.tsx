import { useEffect, useRef, type CSSProperties } from "react";

// The KpnSolute maker's signature is one shared web component, served from
// /brand/kpn-signature@1.js (immutable) and /brand/kpn-signature.js (latest).
// This wrapper only loads it and reserves its box so nothing shifts.
//
// PLACEHOLDER: the path inside the component is a stand-in until the founder
// supplies the real single-stroke vector. Do not invent a new signature.

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

export function MakerSignature({
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
        target={target}
        color={color}
        href={href}
        label={label}
        tail={tail !== undefined ? String(tail) : undefined}
        duration={duration !== undefined ? String(duration) : undefined}
        period={period !== undefined ? String(period) : undefined}
        {...(still ? { static: "" } : {})}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

/** Replays the drawn signature, e.g. when the hero CTA is clicked. */
export function replaySignature(): void {
  const el = document.querySelector("kpn-signature") as (HTMLElement & { replay?: () => void }) | null;
  el?.replay?.();
}

/** Footer mark: static size, links to kpnsolute.com, labelled for screen readers. */
export function MakerMark({ href = "https://kpnsolute.com", still = true }: { href?: string; still?: boolean }) {
  return (
    <MakerSignature
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
