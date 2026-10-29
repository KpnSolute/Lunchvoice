// Icons: the handoff's 20-icon set (24px grid, 1.8 stroke, currentColor) plus the
// small UI glyphs the system needs. One stroke width, one grid, no icon library.

import { HANDOFF_ICONS, type IconShape } from "./icons.generated";

const UI_GLYPHS: Record<string, string[]> = {
  check: ["M4.5 12.5 9.5 17.5 19.5 6.5"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  "chevron-down": ["M6 9.5 12 15.5 18 9.5"],
  "chevron-right": ["M9.5 6 15.5 12 9.5 18"],
  "chevron-left": ["M14.5 6 8.5 12 14.5 18"],
  "arrow-right": ["M4 12h15", "M13 6l6 6-6 6"],
  "arrow-left": ["M20 12H5", "M11 6l-6 6 6 6"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
  external: ["M14 4h6v6", "M20 4l-8 8", "M18 14v5H5V6h5"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3.5 2"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  star: ["M12 4l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 10.2l5.9-.8z"],
  alert: ["M12 4 2.5 20h19z", "M12 10v4.5", "M12 17.2v.1"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 7.6v.1"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v5", "M14 11v5"],
  download: ["M12 4v11", "M7 11l5 5 5-5", "M4 20h16"],
  copy: ["M9 9h11v11H9z", "M15 9V4H4v11h5"],
  edit: ["M4 20h4L20 8l-4-4L4 16z"],
  more: ["M6 12v.1", "M12 12v.1", "M18 12v.1"],
  grip: ["M9 6v.1", "M15 6v.1", "M9 12v.1", "M15 12v.1", "M9 18v.1", "M15 18v.1"],
  filter: ["M3 5h18l-7 8v6l-4 2v-8z"],
  refresh: ["M20 12a8 8 0 1 1-2.3-5.6", "M20 4v5h-5"],
  bell: ["M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6", "M10 19a2 2 0 0 0 4 0"],
  eye: ["M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  target: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"],
  sparkle: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"],
  link: ["M10 14a4 4 0 0 1 0-6l2-2a4 4 0 0 1 6 6l-1 1", "M14 10a4 4 0 0 1 0 6l-2 2a4 4 0 0 1-6-6l1-1"],
  send: ["M4 12 21 4l-7 17-3-7z"],
};

export type IconName = keyof typeof UI_GLYPHS | keyof typeof HANDOFF_ICONS;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  title,
  className,
}: {
  name: IconName | (string & {});
  size?: number;
  strokeWidth?: number;
  title?: string;
  className?: string;
}) {
  const handoff: IconShape[] | undefined = HANDOFF_ICONS[name as string];
  const glyph = UI_GLYPHS[name as string];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      style={{ flex: "0 0 auto" }}
    >
      {title && <title>{title}</title>}
      {handoff
        ? handoff.map((s, i) => {
            const Tag = s.tag as "path";
            return <Tag key={i} {...s.attrs} />;
          })
        : (glyph ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** The LunchVoice mark; `lockup` adds the wordmark for nav and footers. */
export function Logo({ size = 28, lockup = false, to = "/" }: { size?: number; lockup?: boolean; to?: string }) {
  const mark = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
      <img src="/brand/lunchvoice-mark.svg" alt="" width={size} height={size} style={{ width: size, height: size }} />
      {lockup && (
        <span
          style={{
            fontFamily: "var(--lv-font-display)",
            fontWeight: 800,
            fontSize: size * 0.68,
            letterSpacing: "-0.035em",
            lineHeight: 1,
          }}
        >
          LunchVoice
        </span>
      )}
    </span>
  );
  return (
    <a href={to} aria-label="LunchVoice home" style={{ textDecoration: "none", display: "inline-flex" }}>
      {mark}
    </a>
  );
}
