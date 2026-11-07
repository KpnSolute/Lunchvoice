import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";

export interface TabItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

/**
 * Phone navigation (at most five tabs). Solid surface, no blur, 52px targets, safe-area padding.
 * The current tab is the pressed amber surface and carries aria-current="page".
 * `more` items open a bottom sheet behind the last tab.
 */
export function BottomTabs({ label, items, more = [] }: { label: string; items: TabItem[]; more?: TabItem[] }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement | null>(null);
  const shown = more.length ? items.slice(0, 4) : items.slice(0, 5);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    sheet.current?.querySelector<HTMLElement>("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const tab = (t: TabItem, extra?: ReactNode) => (
    <NavLink key={t.to} to={t.to} end={t.end} className="lv-tab" onClick={() => setOpen(false)}>
      <span className="lv-tab-glyph"><Icon name={t.icon} size={22} /></span>
      <span className="lv-tab-label">{t.label}</span>
      {extra}
    </NavLink>
  );

  return (
    <>
      <nav className="lv-bottom-tabs" aria-label={label}>
        {shown.map((t) => tab(t))}
        {more.length > 0 && (
          <button type="button" className="lv-tab" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <span className="lv-tab-glyph"><Icon name="more" size={22} /></span>
            <span className="lv-tab-label">More</span>
          </button>
        )}
      </nav>
      {open && (
        <div className="lv-sheet-scrim" onClick={() => setOpen(false)}>
          <div ref={sheet} className="lv-sheet" role="dialog" aria-label="More sections" onClick={(e) => e.stopPropagation()}>
            <span className="lv-sheet-grip" aria-hidden="true" />
            <div className="lv-sheet-list">{more.map((t) => tab(t))}</div>
          </div>
        </div>
      )}
    </>
  );
}
