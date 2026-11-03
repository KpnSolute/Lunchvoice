/** A Hub's square mark: its initials on ink. Hub colors only appear inside a Hub, and only contrast-checked ones. */
export function HubMark({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="lv-hubmark"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), borderRadius: Math.round(size * 0.28) }}
    >
      {initials || "H"}
    </span>
  );
}
