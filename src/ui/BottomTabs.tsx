import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";

export interface TabItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

/**
 * Phone navigation (at most five tabs). Solid surface, no blur, 52px targets, safe-area padding.
 * The current tab is the pressed amber surface and carries aria-current="page".
 * `more` items open a bottom sheet behind the last tab. The sheet is the Radix-based Sheet (LC-37): modal dialog
 * semantics (aria-modal), focus trapped inside, Escape and the scrim close it, focus returns to "More".
 */
export function BottomTabs({ label, items, more = [] }: { label: string; items: TabItem[]; more?: TabItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = more.length ? items.slice(0, 4) : items.slice(0, 5);

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
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" className="lv-tab">
                <span className="lv-tab-glyph"><Icon name="more" size={22} /></span>
                <span className="lv-tab-label">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetTitle className="sr-only">More sections</SheetTitle>
              <SheetDescription className="sr-only">Other sections of {label}.</SheetDescription>
              <div className="lv-sheet-list">{more.map((t) => tab(t))}</div>
            </SheetContent>
          </Sheet>
        )}
      </nav>
    </>
  );
}
