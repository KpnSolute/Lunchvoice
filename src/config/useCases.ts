import useCaseData from "./useCases.json";

// Typed view of useCases.json (the content, search metadata and sitemap all come from that one file).
export interface UseCase {
  slug: string;
  templateId: string;
  icon: string;
  name: string;
  line: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  why: string[];
  setup: string;
  caveat?: string;
  related: string[];
  /** Template slugs for the "Recommended for" strip (src/config/templates.json). */
  recommended: string[];
}

export const USE_CASES = useCaseData.useCases as UseCase[];
export const useCaseBySlug = (slug: string | undefined) => USE_CASES.find((u) => u.slug === slug) ?? null;
/** The link every "Use this template" button and marketing post points at. */
export const templateHref = (u: UseCase) => `/surveys/new?template=${u.templateId}`;
