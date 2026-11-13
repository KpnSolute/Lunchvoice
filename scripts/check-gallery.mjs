// Every reusable UI component must be visible at /__gallery (src/pages/Gallery.tsx), so agents and people can see what
// exists before building something new. Fails when a component is neither shown nor exempted with a reason.
//
//   node scripts/check-gallery.mjs
//
// Covered: every shadcn primitive file (src/components/shadcn/*.tsx, by import), and every exported PascalCase
// component in the block, product and layout folders below (by name).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const GALLERY = "src/pages/Gallery.tsx";
export const PRIMITIVES = "src/components/shadcn";
export const COMPONENT_DIRS = ["src/components/shadcn/blocks", "src/components", "src/ui"];

/** Not shown in the gallery, each for a stated reason. Keep this short: a new reusable component belongs in the gallery. */
export const EXEMPT = {
  // primitives
  sonner: "the toast host is mounted once in src/main.tsx; the gallery shows toasts with the Toast button",
  // product pieces bound to live data or a signed-in role
  BrandMedia: "player-only decoration that needs a loaded survey theme; covered by e2e/branding.test.mjs",
  BrandBanner: "the thank-you logo; needs a loaded survey theme, covered by e2e/branding.test.mjs",
  ColorPicker: "needs the Popover or Sheet host; covered by e2e/branding.test.mjs (keyboard and phone sheet)",
  ColorSwatch: "entry point of ColorPicker; covered by e2e/branding.test.mjs",
  CheckoutButton: "needs billing config and a session; covered by e2e/commerce.test.mjs",
  CheckoutReturnNotice: "reads the Stripe return query string",
  PricingAction: "a CheckoutButton with a weeks field; covered by e2e/commerce.test.mjs",
  WeeksField: "part of PricingAction",
  ReportDialog: "calls lv_report_*; covered by e2e",
  StaffMenuItem: "staff-only menu entry",
  AccountSuspendedNotice: "shown only for a suspended account",
  TemplateQuestions: "renders a template's questions on use-case pages",
  HubShareRedirect: "a route, not a visual component",
  MakerMark: "shown through MadeBy",
  // app chrome and plumbing
  Seo: "document head only",
  ThemeControl: "used in the gallery header",
  BottomTabs: "fixed phone navigation; shown on every account and Hub page at 390px",
  QuestionInput: "shown in Question controls",
  // legacy wrappers in src/components/ui.tsx around the shadcn blocks (new code imports the blocks)
  Btn: "legacy wrapper of Button", LinkButton: "Button asChild with a Link", Card: "legacy wrapper of the shadcn Card",
  Panel: "legacy wrapper of Card variant ink", Micro: "legacy wrapper of Eyebrow", Pill: "legacy wrapper of Badge",
  PageHead: "legacy wrapper of PageHeader", ErrorNote: "Notice tone error with describeError", Empty: "legacy wrapper of EmptyState",
  Loading: "legacy wrapper of LoadingRows", Meter: "legacy wrapper of QuotaMeter", Tabs: "legacy wrapper of NavTabs",
};

const isComponentName = (n) => /^[A-Z]/.test(n) && /[a-z]/.test(n);

/** Exported component names in a .tsx file (functions and arrow consts, PascalCase). */
export function exportedComponents(source) {
  const names = new Set();
  for (const m of source.matchAll(/^export (?:function|const) ([A-Za-z0-9_]+)/gm)) if (isComponentName(m[1])) names.add(m[1]);
  return [...names];
}

export function checkGallery(root = ".") {
  const galleryPath = join(root, GALLERY);
  if (!existsSync(galleryPath)) return [`${GALLERY} is missing`];
  const gallery = readFileSync(galleryPath, "utf8");
  const missing = [];
  for (const f of readdirSync(join(root, PRIMITIVES)).filter((x) => x.endsWith(".tsx"))) {
    const base = f.replace(/\.tsx$/, "");
    if (EXEMPT[base]) continue;
    if (!gallery.includes(`@/components/shadcn/${base}"`)) missing.push(`${PRIMITIVES}/${f}: primitive not imported in the gallery`);
  }
  for (const dir of COMPONENT_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith(".tsx"))) {
      for (const name of exportedComponents(readFileSync(join(root, dir, f), "utf8"))) {
        if (EXEMPT[name]) continue;
        if (!new RegExp(`<${name}\\b`).test(gallery)) {
          missing.push(`${dir}/${f}: ${name} is not shown at /__gallery (add it to ${GALLERY}, or exempt it with a reason in scripts/check-gallery.mjs)`);
        }
      }
    }
  }
  return missing;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  const missing = checkGallery();
  if (missing.length) { console.error(JSON.stringify({ ok: false, missing }, null, 2)); process.exit(1); }
  console.log(JSON.stringify({ ok: true, gallery: GALLERY }));
}
