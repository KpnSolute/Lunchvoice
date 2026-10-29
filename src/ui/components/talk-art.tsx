// Poster art, not interface: two people mid-conversation in flat pop-art shapes — a
// sunburst behind them, heavy ink outlines, a halftone floor. Decorative, so the SVG is
// labelled for assistive tech and the section carries the copy.
//
// Every colour comes from the --lv-art-* tokens; nothing here picks a literal colour,
// and this palette is deliberately louder than the UI palette.

const RAY_COUNT = 18;
const CX = 400;
const CY = 268;

const RAYS = Array.from({ length: RAY_COUNT }, (_, i) => {
  const R = 820;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const a0 = (i * 360) / RAY_COUNT - 90;
  const a1 = ((i + 1) * 360) / RAY_COUNT - 90;
  return {
    d: [
      `M${CX} ${CY}`,
      `L${(CX + Math.cos(rad(a0)) * R).toFixed(1)} ${(CY + Math.sin(rad(a0)) * R).toFixed(1)}`,
      `L${(CX + Math.cos(rad(a1)) * R).toFixed(1)} ${(CY + Math.sin(rad(a1)) * R).toFixed(1)}`,
      "Z",
    ].join(" "),
    tone: i % 4,
  };
});

/**
 * One person, drawn facing slightly right of centre and mirrored for the second.
 * Local coordinates put the head at (250, 262) with a 116 radius.
 */
function Person({ tone }: { tone: "cool" | "warm" }) {
  const head = tone === "cool" ? "art-head-cool" : "art-head-warm";
  const shoulder = tone === "cool" ? "art-shoulder-cool" : "art-shoulder-warm";
  const hair = tone === "cool" ? "art-hair-magenta" : "art-hair-plum";
  const shades = tone === "cool" ? "art-shades-cool" : "art-shades-warm";
  return (
    <g>
      {/* shoulders and neck */}
      <path d="M92 520 C100 448 148 410 196 398 L232 392 C240 414 260 414 268 392 L304 398 C352 410 400 448 408 520 Z" className={shoulder} />
      <path d="M92 520 C100 448 148 410 196 398 L232 392 C240 414 260 414 268 392 L304 398 C352 410 400 448 408 520" className="art-outline" />
      <path d="M224 348 L276 348 L276 400 C266 408 234 408 224 400 Z" className={shoulder} />
      <circle cx="250" cy="262" r="116" className={head} />
      <circle cx="250" cy="262" r="116" className="art-outline" />

      {/* hair: a fringe cap with three combed strands */}
      <path d="M136 258 C136 182 188 140 250 140 C312 140 364 182 364 258 C338 224 298 206 250 206 C202 206 162 224 136 258 Z" className={hair} />
      <path d="M136 258 C136 182 188 140 250 140 C312 140 364 182 364 258" className="art-outline" />
      <path d="M158 246 C174 208 202 186 238 176" className="art-hair-line" />
      <path d="M186 252 C200 220 224 200 254 190" className="art-hair-line" />
      <path d="M214 256 C226 232 244 216 266 208" className="art-hair-line" />

      {/* glasses, cheek and mouth */}
      <rect x="176" y="244" width="60" height="38" rx="14" className={shades} />
      <rect x="264" y="244" width="60" height="38" rx="14" className={shades} />
      <path d="M236 260 C244 254 256 254 264 260" className="art-outline" />
      <path d="M176 262 L150 268" className="art-outline" />
      <path d="M324 262 L350 268" className="art-outline" />
      <circle cx="196" cy="310" r="17" className="art-cheek" />
      <path d="M228 320 C240 332 260 332 272 320" className="art-outline" />
    </g>
  );
}

// `fit="slice"` is for the poster used as a section background: the art fills whatever
// box it is given and crops, instead of letterboxing inside it.
export function TalkArt({ className, fit = "meet" }: { className?: string; fit?: "meet" | "slice" }) {
  return (
    <svg
      viewBox="0 0 800 520"
      className={className}
      preserveAspectRatio={`xMidYMid ${fit}`}
      role="img"
      aria-label="Two people talking"
    >
      <defs>
        <clipPath id="talk-frame">
          <rect x="0" y="0" width="800" height="520" rx="0" />
        </clipPath>
        <pattern id="talk-halftone" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="3.2" className="art-halftone-dot" />
        </pattern>
      </defs>

      <g clipPath="url(#talk-frame)">
        <rect x="0" y="0" width="800" height="520" className="art-sky" />
        <g>
          {RAYS.map((r, i) => (
            <path key={i} d={r.d} className={`art-ray art-ray-${r.tone}`} />
          ))}
        </g>

        {/* the two of them, leaning toward each other */}
        <g transform="rotate(-2 250 300)">
          <Person tone="cool" />
        </g>
        <g transform="translate(800 0) scale(-1 1) rotate(-2 250 300)">
          <Person tone="warm" />
        </g>

        {/* sound travelling between them */}
        <g>
          <path d="M382 300 C394 290 394 274 382 264" className="art-outline-thin" />
          <path d="M398 310 C416 298 416 266 398 254" className="art-outline-thin" />
          <path d="M414 320 C438 304 438 260 414 244" className="art-outline-thin" />
        </g>

        {/* two bubbles: one saying, one reacting */}
        <g className="art-bob">
          <rect x="300" y="70" width="150" height="78" rx="26" className="art-bubble-warm" />
          <path d="M330 144 L316 176 L360 150 Z" className="art-bubble-warm" />
          <path d="M382 96 C392 86 402 90 402 100 C402 112 386 122 376 128 C366 122 350 112 350 100 C350 90 360 86 370 96" className="art-heart" />
        </g>
        <g className="art-bob art-bob-slow">
          <rect x="452" y="126" width="156" height="80" rx="26" className="art-bubble-cool" />
          <path d="M484 202 L470 234 L516 208 Z" className="art-bubble-cool" />
          <circle cx="494" cy="166" r="8" className="art-dot-ink" />
          <circle cx="524" cy="166" r="8" className="art-dot-ink" />
          <circle cx="554" cy="166" r="8" className="art-dot-ink" />
        </g>

        {/* halftone floor and a little confetti */}
        <rect x="0" y="408" width="800" height="112" fill="url(#talk-halftone)" className="art-halftone" />
        <g className="art-confetti">
          <circle cx="86" cy="452" r="9" />
          <circle cx="716" cy="440" r="7" />
          <circle cx="648" cy="486" r="5" />
          <circle cx="132" cy="492" r="6" />
        </g>
      </g>
    </svg>
  );
}
