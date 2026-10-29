// Typed mirror of tokens.css. Use these only where a JS value is unavoidable
// (chart geometry, animation timing, inline layout math). Styling belongs in CSS.

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 14: 56, 16: 64, 24: 96 } as const;

export const RADIUS = { field: 16, card: 24, hero: 28, pill: 999 } as const;

export const MOTION = {
  spring: "cubic-bezier(.34,1.56,.64,1)",
  ease: "cubic-bezier(.2,.7,.2,1)",
  d1: 150,
  d2: 260,
  d3: 460,
  popover: 280,
  jelly: 560,
  countUp: 600,
  ticker: 40_000,
  livePulse: 1600,
} as const;

export const TYPE_ROLES = [
  "display-xl",
  "display-lg",
  "display-md",
  "title",
  "body",
  "ui",
  "small",
  "label",
  "code",
] as const;

export const BREAKPOINTS = { phone: 720, tablet: 900, wide: 1120 } as const;

export const TARGET = { min: 44, tap: 48, circle: 58 } as const;

// Contrast-safe Hub accent choices (CONTRAST.md: amber is fill-only, ink sits on top).
// `on` is the only text colour allowed on that fill; each pair was checked at >= 4.5:1.
export const HUB_COLORS = [
  { name: "Amber", value: "#FF9A18", on: "#14110F" },
  { name: "Clay", value: "#9C4A14", on: "#F7F3EA" },
  { name: "Moss", value: "#1F6B40", on: "#F7F3EA" },
  { name: "Ink", value: "#14110F", on: "#F7F3EA" },
  { name: "Slate", value: "#41556B", on: "#F7F3EA" },
  { name: "Plum", value: "#6B3E6B", on: "#F7F3EA" },
] as const;
