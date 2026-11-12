// The LunchVoice mark, drawn inline so it follows the surface it sits on: the L and V take the text colour
// (ink on light, bone on dark and on ink bands), while the speech bubble and the smile stay brand amber in every theme.
// The shapes are the brand's one vector source (scripts/brand/logo.mjs); `npm run check:brand` fails if they differ.
// Use this in the interface, never an image file. The files in public/brand are for downloads and link previews.
//
// The viewBox is cropped to the artwork (x 40-378, y 4-377), so the mark is centred in its box. `size` is the height
// the whole drawing used to have; the artwork is drawn at the same size as before the crop, with no empty margin.
const ART_W = 338;
const ART_H = 373;
const LEGACY_H = 430;

export function LvMark({ size = 28, className }: { size?: number; className?: string }) {
  const h = Math.round((size * ART_H) / LEGACY_H * 10) / 10;
  const w = Math.round((h * ART_W) / ART_H * 10) / 10;
  return (
    <svg className={className} width={w} height={h} viewBox="40 4 338 373" aria-hidden="true" focusable="false" data-lv-mark>
      <polygon points="40,40 112,40 112,232 262,232 262,304 40,304" fill="currentColor" />
      <polygon points="132,40 178,40 218,196 258,40 304,40 224,322 200,322" fill="currentColor" />
      <path d="M244,4 h108 a26,26 0 0 1 26,26 v34 a26,26 0 0 1 -26,26 h-64 l-26,26 l4,-26 h-22 a26,26 0 0 1 -26,-26 v-34 a26,26 0 0 1 26,-26 z" fill="var(--lv-accent)" />
      <circle cx="272" cy="47" r="6.5" fill="#fff" />
      <circle cx="298" cy="47" r="6.5" fill="#fff" />
      <circle cx="324" cy="47" r="6.5" fill="#fff" />
      <path d="M78,344 Q200,410 322,344 L308,330 Q200,378 92,330 Z" fill="var(--lv-accent)" />
    </svg>
  );
}
