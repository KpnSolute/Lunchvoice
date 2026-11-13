import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { checkBrandColor, hexToHsv, hsvToHex, loadRecent, normalizeHex, PRESET_COLORS, pushRecent } from "../lib/surveyTheme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import "./color-picker.css";

/**
 * A small accessible color picker (no dependency): saturation/value area, hue slider, hex field, eyedropper where the
 * browser has one, curated presets (all readable on white) and recent colors (this browser only). Survey colors must
 * reach 4.5:1 on white, so the picker tells the person right away and offers the nearest readable shade.
 */
export function ColorPicker({ value, onChange, onCommit, label }: { value: string; onChange: (hex: string) => void; onCommit?: (hex: string) => void; label: string }) {
  const start = normalizeHex(value) ?? "#0f766e";
  const [hsv, setHsv] = useState(() => hexToHsv(start));
  const [text, setText] = useState(start);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const area = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  // Follow outside changes (a preset elsewhere, "use the closest shade") without fighting the drag.
  useEffect(() => {
    const v = normalizeHex(value);
    if (v && v !== hex) { setHsv(hexToHsv(v)); setText(v); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const apply = useCallback((next: { h: number; s: number; v: number }) => {
    setHsv(next);
    const h = hsvToHex(next.h, next.s, next.v);
    setText(h);
    onChange(h);
  }, [onChange]);
  const setHex = (h: string) => { const c = normalizeHex(h); if (c) { setHsv(hexToHsv(c)); setText(c); onChange(c); } };
  const commit = (h: string) => { setRecent(pushRecent(h)); onCommit?.(h); };

  function fromPointer(e: PointerEvent<HTMLDivElement>) {
    const r = area.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    apply({ h: hsv.h, s, v });
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    apply({ h: hsv.h, s: Math.min(1, Math.max(0, hsv.s + m[0])), v: Math.min(1, Math.max(0, hsv.v + m[1])) });
  }
  async function eyedrop() {
    try {
      const Ctor = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
      if (!Ctor) return;
      const r = await new Ctor().open();
      setHex(r.sRGBHex);
      commit(r.sRGBHex);
    } catch { /* cancelled */ }
  }

  const check = checkBrandColor(hex);
  const hasEyedropper = typeof window !== "undefined" && "EyeDropper" in window;
  return (
    <div className="lv-cp" data-testid="brand-picker">
      <div
        ref={area}
        className="lv-cp-sv"
        style={{ backgroundColor: hsvToHex(hsv.h, 1, 1) }}
        role="slider"
        tabIndex={0}
        aria-label={`${label}: saturation and brightness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent. Arrow keys adjust; Shift for bigger steps.`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (e.buttons) fromPointer(e); }}
        onPointerUp={() => commit(hex)}
        onKeyDown={onKey}
        onBlur={() => commit(hex)}
        data-testid="brand-sv"
      >
        <span className="lv-cp-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <label className="lv-cp-hue">
        <span className="lv-sr-only">{label}: hue</span>
        <input type="range" min={0} max={360} step={1} value={Math.round(hsv.h)} aria-label={`${label}: hue`} onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })} onPointerUp={() => commit(hex)} onBlur={() => commit(hex)} data-testid="brand-hue" />
      </label>
      <div className="lv-cp-row">
        <span className="lv-cp-chip" style={{ background: hex }} aria-hidden="true" />
        <Input
          aria-label={`${label}: hex color`}
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => { setText(e.target.value); const c = normalizeHex(e.target.value); if (c) { setHsv(hexToHsv(c)); onChange(c); } }}
          onBlur={() => { const c = normalizeHex(text); if (c) commit(c); else setText(hex); }}
          data-testid="brand-hex"
        />
        {hasEyedropper && <Button variant="secondary" size="sm" onClick={() => void eyedrop()} data-testid="brand-eyedropper">Pick from screen</Button>}
      </div>
      <p className="ui-help lv-m0" data-readable={check.ok ? "yes" : "no"} role="status" data-testid="brand-picker-contrast">
        {check.ok ? `Readable: ${check.ratio.toFixed(1)}:1 on white.` : `Too light: ${check.ratio.toFixed(1)}:1 on white. Text and buttons need 4.5:1.`}
      </p>
      {!check.ok && check.suggestion && (
        <Button variant="secondary" size="sm" onClick={() => { setHex(check.suggestion!); commit(check.suggestion!); }} data-testid="brand-picker-fix">Use the closest readable shade ({check.suggestion})</Button>
      )}
      <fieldset className="lv-cp-group">
        <legend className="lv-legend">Presets</legend>
        <div className="lv-cp-swatches">
          {PRESET_COLORS.map((p) => (
            <button key={p.hex} type="button" className="lv-cp-swatch" style={{ background: p.hex }} aria-label={`${p.name} ${p.hex}`} aria-pressed={hex === p.hex} title={p.name} onClick={() => { setHex(p.hex); commit(p.hex); }} data-testid={`brand-preset-${p.hex}`} />
          ))}
        </div>
      </fieldset>
      {recent.length > 0 && (
        <fieldset className="lv-cp-group">
          <legend className="lv-legend">Recent</legend>
          <div className="lv-cp-swatches">
            {recent.map((c) => (
              <button key={c} type="button" className="lv-cp-swatch" style={{ background: c }} aria-label={`Recent ${c}`} aria-pressed={hex === c} onClick={() => { setHex(c); commit(c); }} data-testid={`brand-recent-${c}`} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

function useIsPhone() {
  const q = "(max-width: 640px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/**
 * A rounded swatch with a small pencil badge (the Discord-style entry point). Opens the picker in a popover, or a
 * bottom sheet on phones.
 */
export function ColorSwatch({ label, value, background, onChange, disabled, testId }: {
  label: string; value: string | null; background?: string; onChange: (hex: string) => void; disabled?: boolean; testId: string;
}) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const shown = normalizeHex(value);
  const trigger = (
    <button type="button" className="lv-swatch" disabled={disabled} style={{ background: background ?? shown ?? undefined }} data-empty={shown ? undefined : "yes"} aria-label={`${label}${shown ? `, ${shown}` : ", not set"}. Edit color`} data-testid={testId}>
      <span className="lv-swatch-edit" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </span>
    </button>
  );
  const body = <ColorPicker value={shown ?? "#0f766e"} onChange={onChange} label={label} />;
  return (
    <div className="lv-swatch-field">
      {phone ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader><SheetTitle>{label}</SheetTitle><SheetDescription>Pick a color that is readable on white.</SheetDescription></SheetHeader>
            {body}
            <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="lv-cp-pop" aria-label={`${label} color picker`}>{body}</PopoverContent>
        </Popover>
      )}
      <span className="lv-swatch-label">{label}</span>
      <span className="lv-swatch-hex">{shown ?? "Not set"}</span>
    </div>
  );
}
