import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import seo from "../config/seo.json";

export type SeoPage = (typeof seo.pages)[number];

/** Strip a trailing slash so "/pricing/" and "/pricing" share one canonical entry. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : "/";
}

export function seoFor(pathname: string): { page: SeoPage | null; title: string; description: string; url: string; index: boolean } {
  const path = normalizePath(pathname);
  const page = seo.pages.find((p) => p.path === path) ?? null;
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
