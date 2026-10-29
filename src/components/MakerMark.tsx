// KpnSolute maker's mark — the quiet "made by" signature, never the hero.
//
// PLACEHOLDER: neither the Lunchvoice nor the KpnSolute Website repo contains a
// KpnSolute signature SVG or a defined KpnSolute typeface yet (checked 2026-10-29).
// When Miah supplies them, drop the files in `src/brand/kpnsolute/`, render the
// mark with `currentColor` so it themes, and delete the text fallback below.
// Until then this renders the wordmark in the maker typeface token.

export function MakerMark({ size = 15 }: { size?: number }) {
  return (
    <span className="maker-mark" style={{ fontSize: size }} aria-label="KpnSolute">
      <span aria-hidden="true">KpnSolute</span>
    </span>
  );
}

export function MadeBy({ className = "" }: { className?: string }) {
  return (
    <p className={`made-by ${className}`.trim()}>
      Made by <MakerMark />
    </p>
  );
}
