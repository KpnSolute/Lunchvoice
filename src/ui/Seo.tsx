import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import seo from "../config/seo.json";
import useCaseData from "../config/useCases.json";
import productData from "../config/products.json";
import templateData from "../config/templates.json";

export type SeoPage = (typeof seo.pages)[number];

const PLAN_LINE: Record<string, string> = { free: "Free with any account.", plus: "Included with Creator Plus or a Starter Hub.", pro: "Included with Creator Pro or a Team Hub." };
const catSlug = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The template gallery's pages. Mirrors templatePages() in scripts/seo-prerender.mjs; seo-prerender.test.mjs checks they agree. */
export function templatePages(templates: { slug: string; name: string; blurb: string; intro: string; category: string; plan: string; anonymity: string; questions: { prompt: string }[] }[]) {
  const cats = [...new Set(templates.map((t) => t.category))];
  const noun = (n: number) => (n === 1 ? "question" : "questions");
  return [
    { path: "/templates", title: `${templates.length} survey templates for any group`, description: `Browse ${templates.length} ready-made survey templates in ${cats.length} categories. Preview every question, then use one for free or with Creator Plus and Pro.`, h1: "Survey templates", body: `Ready-made surveys for customers, teams, events, schools, dining, communities and more. ${cats.join(", ")}.`, changefreq: "weekly", priority: 0.7 },
    ...cats.map((c) => {
      const inCat = templates.filter((t) => t.category === c);
      return { path: `/templates/${catSlug(c)}`, title: `${c} survey templates`, description: `${inCat.length} ready-made ${c.toLowerCase()} survey templates. Preview every question, then use one and change anything you like.`, h1: `${c} survey templates`, body: inCat.map((t) => `${t.name}: ${t.blurb}`).join(" "), changefreq: "monthly", priority: 0.6 };
    }),
    ...templates.map((t) => ({
      path: `/templates/${t.slug}`, title: `${t.name} survey template`,
      description: `${t.blurb} ${t.questions.length} ${noun(t.questions.length)}, ${t.anonymity === "identified" ? "identified" : "anonymous"}. ${PLAN_LINE[t.plan]} Preview it, then edit anything.`,
      h1: `${t.name} survey template`, body: `${t.intro} Questions: ${t.questions.map((q) => q.prompt).join(" ")}`, changefreq: "monthly", priority: 0.5,
    })),
  ];
}

/** Hand-written pages plus one per product and one per use case (the same merge scripts/seo-prerender.mjs does for the build). */
const PAGES: SeoPage[] = [
  ...seo.pages,
  ...productData.products.map((p) => ({
    path: `/products/${p.slug}`, title: p.title, description: p.description, h1: p.h1, body: p.lede, changefreq: "monthly", priority: 0.8,
  })),
  ...useCaseData.useCases.map((u) => ({
    path: `/use-cases/${u.slug}`, title: u.title, description: u.description, h1: u.h1, body: u.lede, changefreq: "monthly", priority: 0.7,
  })),
  ...templatePages(templateData.templates),
];

/** Strip a trailing slash so "/pricing/" and "/pricing" share one canonical entry. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : "/";
}

export function seoFor(pathname: string): { page: SeoPage | null; title: string; description: string; url: string; index: boolean } {
  const path = normalizePath(pathname);
  const page = PAGES.find((p) => p.path === path) ?? null;
  const title = page ? (path === "/" ? page.title : page.title + seo.titleSuffix) : seo.siteName;
  return {
    page,
    title,
    description: page?.description ?? seo.defaultDescription,
    url: seo.siteUrl + (path === "/" ? "/" : path),
    index: page !== null,
  };
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Keeps the document head in step with the route on client-side navigation. Only the public pages in
 * src/config/seo.json are indexable; every other route (account, Hubs, players, sign-in) is noindex.
 */
export function Seo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const s = seoFor(pathname);
    document.title = s.title;
    setMeta("name", "description", s.description);
    setMeta("name", "robots", s.index ? "index, follow, max-image-preview:large" : "noindex");
    setCanonical(s.index ? s.url : null);
    setMeta("property", "og:title", s.title);
    setMeta("property", "og:description", s.description);
    setMeta("property", "og:url", s.url);
    setMeta("name", "twitter:title", s.title);
    setMeta("name", "twitter:description", s.description);
  }, [pathname]);
  return null;
}
