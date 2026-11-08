import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { HubInfo } from "../lib/lvApi";
import { accentHex, accentVars, ACCENTS, onAccent } from "../lib/accent";
import { HubMark } from "../ui/HubMark";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Eyebrow, SectionTitle } from "@/components/shadcn/blocks";

type SaveState = "idle" | "saving" | "saved" | "error";
const NONE = "none"; // radio value for "no accent" (the API clears it with '')

/**
 * "Community appearance": pick the Hub's accent from the contrast-safe palette and see the Hub with it before saving.
 * Saves the palette KEY through lv_hub_update(p_accent) ('' clears it, 000015). The accent only ever colours the Hub's
 * own pages, never LunchVoice chrome.
 */
export function HubAppearance({ hub, reload }: { hub: HubInfo; reload: () => void }) {
  const { api } = useIdentity();
  const palette = hub.accent_palette?.length ? hub.accent_palette : ACCENTS;
  const saved = hub.accent || NONE;
  const [pick, setPick] = useState<string>(saved);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPick(hub.accent || NONE), [hub.accent]);
  const dirty = pick !== saved;
  const hex = accentHex(pick === NONE ? null : pick, palette);
  const label = palette.find((p) => p.key === pick)?.label ?? "LunchVoice ink";

  async function save() {
    setState("saving");
    setError(null);
    // The SQL takes the palette key, or '' to clear (lv_hub_update, 000015).
    const r = await api.hubUpdate(hub.hub_id, { accent: pick === NONE ? "" : pick });
    if (!r.ok) {
      setState("error");
      setError(describeError(r.error));
      toast.error(describeError(r.error));
      return;
    }
    setState("saved");
    toast.success(pick !== NONE ? `${label} is now your Hub color` : "Hub color removed");
    reload();
  }

  const status = state === "saving" ? "Saving…" : state === "error" ? `Couldn’t save: ${error}` : dirty ? "Unsaved changes" : state === "saved" ? "Saved" : "No changes";

  return (
    <Card data-testid="appearance">
      <SectionTitle>Community appearance</SectionTitle>
      <div className="lv-appearance">
        <div className="lv-stack-16">
          <p className="ui-muted lv-m0">Pick your Hub’s color. It shows on your Hub’s banner, icon, tabs and Campaign cards. Every color keeps text readable.</p>
          <RadioGroupPrimitive.Root
            className="lv-swatch-grid"
            aria-label="Hub color"
            value={pick}
            onValueChange={(v) => { setPick(v); if (state !== "saving") setState("idle"); }}
            data-testid="accent-swatches"
          >
            <SwatchItem value={NONE} label="Ink" hex="#14110f" />
            {palette.map((p) => <SwatchItem key={p.key} value={p.key} label={p.label} hex={p.hex} />)}
          </RadioGroupPrimitive.Root>
          <p className="ui-help lv-m0">Banner image coming later.</p>
          <div className="ui-row">
            <Button variant="ink" onClick={save} disabled={!dirty || state === "saving"} data-testid="accent-save">{state === "saving" ? "Saving…" : "Save appearance"}</Button>
            {dirty && <Button variant="quiet" onClick={() => setPick(saved)}>Reset</Button>}
            <span className="lv-save" role="status" aria-live="polite" data-status={state === "saving" ? "saving" : state === "error" ? "error" : dirty ? "dirty" : state === "saved" ? "saved" : "idle"} data-testid="accent-state">
              <span className="lv-save-dot" aria-hidden="true" />{status}
            </span>
          </div>
        </div>
        <AppearancePreview hub={hub} hex={hex} label={label} />
      </div>
    </Card>
  );
}

function SwatchItem({ value, label, hex }: { value: string; label: string; hex: string }) {
  return (
    <RadioGroupPrimitive.Item value={value} className="lv-swatch2" aria-label={label} data-testid={`swatch-${value === NONE ? "ink" : value}`}>
      <span className="lv-swatch2-dot" style={{ background: hex, color: onAccent(hex) }}>
        <RadioGroupPrimitive.Indicator className="lv-swatch2-check" aria-hidden="true">✓</RadioGroupPrimitive.Indicator>
      </span>
      <span className="lv-swatch2-label">{label}</span>
    </RadioGroupPrimitive.Item>
  );
}

/** Live preview of the Hub with the chosen color, before saving. */
export function AppearancePreview({ hub, hex, label }: { hub: HubInfo; hex: string | null; label: string }) {
  return (
    <figure className="lv-ap-preview lv-hubscope" style={accentVars(hex ?? "#14110f")} aria-label={`Preview of ${hub.name} in ${label}`} data-testid="appearance-preview">
      <div className="lv-ap-banner" aria-hidden="true" />
      <div className="lv-ap-body">
        <div className="lv-ap-head">
          <span className="lv-ap-mark"><HubMark name={hub.name} size={52} /></span>
          <div className="lv-ap-id">
            <strong>{hub.name}</strong>
            <span className="ui-muted">lunchvoice.com/{hub.slug}</span>
          </div>
          <span className="lv-ap-join">Join</span>
        </div>
        <p className="lv-ap-about">{hub.about?.trim() || "Your about line appears here."}</p>
        <div className="lv-ap-tabs" aria-hidden="true"><span data-on>Campaigns</span><span>News</span><span>Members</span></div>
        <div className="lv-ap-card">
          <div className="ui-spread"><Badge variant="open">open</Badge><Eyebrow>poll</Eyebrow></div>
          <strong>Which night works for the social?</strong>
          <span className="ui-muted">2 options · closes Friday</span>
        </div>
      </div>
      <figcaption className="ui-help">Preview · {label}</figcaption>
    </figure>
  );
}
