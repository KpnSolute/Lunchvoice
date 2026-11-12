import productData from "./products.json";

// Typed view of products.json: the six product pages, the Products menu, the footer, the search metadata and the
// sitemap all come from that one file.
export type ProductCell = string | boolean;
export interface ProductPlanRow {
  label: string;
  /** A key of the server's entitlement map (lv_plan_limits families). The row is left out when the map has no value. */
  key?: string;
  /** [Free, Starter Hub, Team Hub] for facts that are not a limit. */
  cells?: [ProductCell, ProductCell, ProductCell];
}
export type ProductDemo = "hub-card" | "questions" | "lifecycle" | "commands" | "curl" | "withheld";
export interface ProductPage {
  slug: string;
  name: string;
  icon: string;
  line: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  audience: string[];
  points: { title: string; body: string }[];
  planRows: ProductPlanRow[];
  fits: string;
  plans: string[];
  cta: "survey" | "hub" | "developers";
  demo: ProductDemo;
  related: string[];
}

export const PRODUCTS = productData.products as ProductPage[];
export const productBySlug = (slug: string | undefined) => PRODUCTS.find((p) => p.slug === slug) ?? null;

type Families = Partial<Record<"free" | "starter" | "team", Record<string, unknown> | null | undefined>>;
const FAMILIES = ["free", "starter", "team"] as const;

/** One value of the entitlement map as a table cell: a number as typed, true as a tick, anything else as a dash. */
function mapCell(v: unknown): ProductCell {
  if (v === true) return true;
  if (typeof v === "number") return v.toLocaleString("en-US");
  return false;
}

/**
 * The "by plan" rows for a product. Rows with a key are read from the server's entitlement map, so the page cannot
 * drift from what a plan really allows; when the map has no value for any plan the row is left out, never guessed.
 */
export function productPlanRows(p: ProductPage, families?: Families | null): { label: string; cells: [ProductCell, ProductCell, ProductCell] }[] {
  const out: { label: string; cells: [ProductCell, ProductCell, ProductCell] }[] = [];
  for (const r of p.planRows) {
    if (r.cells) { out.push({ label: r.label, cells: r.cells }); continue; }
    if (!r.key || !families) continue;
    const raw = FAMILIES.map((f) => families[f]?.[r.key!]);
    if (raw.every((v) => v === undefined || v === null || v === false)) continue;
    out.push({ label: r.label, cells: raw.map(mapCell) as [ProductCell, ProductCell, ProductCell] });
  }
  return out;
}
