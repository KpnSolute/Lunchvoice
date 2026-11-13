import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { CampaignDetailData } from "../lib/lvApi";
import { useLv } from "../lib/useLv";
import {
  brandingProblem, checkBrandColor, EMPTY_BRANDING, HEADLINE_MAX, imagePath, imageProblem, IMAGE_LIMITS, normalizeHex,
  resolveTheme, sniffImage, THANKS_MAX, type ImageKind, type SurveyBranding,
} from "../lib/surveyTheme";
import { BrandMedia, themeState, useBlobUrl } from "../ui/PlayerTheme";
import { Icon } from "../components/Icon";
import type { SaveTracker } from "./QuestionWorkbench";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Switch } from "@/components/shadcn/switch";
import { Field, Notice } from "@/components/shadcn/blocks";

/**
 * Survey branding (000043), shared by the Studio (Campaigns) and the Quick Survey editor. The theme belongs to this
 * survey: a Hub Campaign can start from the Hub's color, or explicitly follow it, but never has to. The server decides
 * the plan on save (the Hub's plan or the creator's own Creator plan); this panel explains it and previews both screens.
 */
export function SurveyBrandingPanel({ d, save, reload }: { d: CampaignDetailData; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const id = d.campaign.campaign_id;
  const info = useLv(() => api.brandingGet(id), [api, id]);
  const [draft, setDraft] = useState<SurveyBranding>(EMPTY_BRANDING);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState<"phone" | "desktop">("phone");
  // Images picked in this session show from the local file; saved ones load from storage.
  const [local, setLocal] = useState<{ logo: string | null; cover: string | null }>({ logo: null, cover: null });
  const [savedUrls, setSavedUrls] = useState<{ logo: string | null; cover: string | null }>({ logo: null, cover: null });

  const data = info.data;
  useEffect(() => { if (data) { setDraft({ ...EMPTY_BRANDING, ...(data.branding ?? {}) }); setDirty(false); } }, [data]);
  const setLogoSaved = useCallback((u: string | null) => setSavedUrls((s) => ({ ...s, logo: u })), []);
  const setCoverSaved = useCallback((u: string | null) => setSavedUrls((s) => ({ ...s, cover: u })), []);
  useBlobUrl(api, "logo", draft.logo_path, setLogoSaved);
  useBlobUrl(api, "cover", draft.cover_path, setCoverSaved);

  const archived = d.campaign.status === "archived";
  const allowed = data?.features.branding ?? false;
  const canFooter = data?.features.remove_footer ?? false;
  const isHub = data?.hub.kind === "community";
  const hubColor = data?.hub.accent_hex ?? null;
  const off = !allowed || archived || busy;

  const check = draft.color ? checkBrandColor(draft.color) : null;
  const effective = draft.follow_hub && hubColor ? hubColor : draft.color;
  const set = (patch: Partial<SurveyBranding>) => { setDraft((b) => ({ ...b, ...patch })); setDirty(true); setError(null); };

  const logoUrl = local.logo ?? savedUrls.logo;
  const coverUrl = local.cover ?? savedUrls.cover;
  const theme = useMemo(() => resolveTheme({ ...draft, color: effective ?? null }, null, canFooter), [draft, effective, canFooter]);

  async function pick(kind: ImageKind, file: File | undefined) {
    if (!file) return;
    const sniffed = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    const problem = imageProblem(kind, file.size, sniffed);
    if (problem) { setError(problem); return; }
    setBusy(true);
    const path = imagePath(id, kind, sniffed!);
    const r = await api.brandingUpload(kind, path, file, sniffed!);
    setBusy(false);
    if (!r.ok) { setError(describeError(r.error)); return; }
    setLocal((l) => ({ ...l, [kind]: URL.createObjectURL(file) }));
    set(kind === "logo" ? { logo_path: path } : { cover_path: path });
  }
  function clear(kind: ImageKind) {
    setLocal((l) => ({ ...l, [kind]: null }));
    set(kind === "logo" ? { logo_path: null } : { cover_path: null });
  }

  async function persist(next: SurveyBranding | null) {
    if (next) {
      const problem = brandingProblem(next, Boolean(isHub));
      if (problem) { setError(problem); return; }
    }
    setBusy(true);
    const r = await save.run(api.brandingSet(id, next));
    setBusy(false);
    if (!r.ok) { setError(describeError(r.error)); return; }
    setError(null);
    toast.success(next ? "Branding saved" : "Back to LunchVoice styling");
    if (!next) { setLocal({ logo: null, cover: null }); setDraft(EMPTY_BRANDING); }
    setDirty(false);
    info.reload();
    reload();
  }

  if (info.loading && !data) return <Card data-testid="branding"><h2 className="lv-share-h">Branding</h2><p className="ui-muted lv-m0">Loading…</p></Card>;
  if (!data) return null;

  return (
    <Card data-testid="branding">
      <div className="ui-row lv-branding-head">
        <h2 className="lv-share-h">Branding</h2>
        {!allowed && <Badge variant="outline" data-testid="branding-locked"><Icon name="lock" size={12} />{isHub ? "Starter Hub or Creator Plus" : "Creator Plus"}</Badge>}
      </div>
      {!allowed ? (
        <div data-testid="branding-locked-note"><Notice>
          Your color, logo and welcome message on this survey start with {isHub ? "a Starter Hub or " : ""}Creator Plus. Your survey works exactly as it is without them.{" "}
          <Link to="/pricing" className="ui-link">See plans</Link>
        </Notice></div>
      ) : (
        <p className="ui-help lv-m0">This look belongs to this survey only. It never changes your anonymity settings, questions or answers.</p>
      )}
      {archived && <Notice>An archived survey can no longer be changed.</Notice>}

      <div className="lv-branding-grid">
        <div className="lv-stack-16">
          <fieldset className="lv-fieldset" disabled={off}>
            <legend className="lv-legend">Brand color</legend>
            <div className="ui-row lv-branding-color">
              <input type="color" aria-label="Pick a color" value={normalizeHex(effective) ?? "#1f6f5b"} disabled={off || draft.follow_hub} onChange={(e) => set({ color: e.target.value })} className="lv-color-input" />
              <Input aria-label="Brand color (hex)" value={draft.follow_hub ? hubColor ?? "" : draft.color ?? ""} placeholder="#1f6f5b" maxLength={7} disabled={off || draft.follow_hub} onChange={(e) => set({ color: e.target.value.trim() || null })} data-testid="brand-color" />
              {draft.color && <Button variant="ghost" size="sm" onClick={() => set({ color: null })} disabled={off || draft.follow_hub}>Clear</Button>}
            </div>
            {check && !draft.follow_hub && (
              check.ok
                ? <p className="ui-help lv-m0" data-testid="brand-contrast-ok">Readable: {check.ratio.toFixed(1)}:1 on white (WCAG AA needs 4.5:1).</p>
                : check.suggestion
                  ? <div className="lv-stack-8" data-testid="brand-contrast-bad">
                      <p className="ui-help lv-m0" role="alert">Too light: {check.ratio.toFixed(1)}:1 on white. Text and buttons in this color would be hard to read, so it can’t be saved.</p>
                      <Button variant="secondary" size="sm" onClick={() => set({ color: check.suggestion })} data-testid="brand-use-suggestion">Use the closest readable shade ({check.suggestion})</Button>
                    </div>
                  : <p className="ui-help lv-m0" role="alert">Use a color like #1f6f5b.</p>
            )}
            {isHub && hubColor && (
              <div className="lv-stack-8">
                <Button variant="secondary" size="sm" onClick={() => set({ color: hubColor, follow_hub: false })} disabled={off} data-testid="brand-use-hub">Start from the Hub’s color ({hubColor})</Button>
                <label className="ui-row lv-switch-row">
                  <Switch checked={draft.follow_hub} onCheckedChange={(v) => set({ follow_hub: v })} disabled={off} aria-label="Follow the Hub’s color" data-testid="brand-follow-hub" />
                  <span>Keep following the Hub’s color. Off by default: a copied color stays put if the Hub changes later.</span>
                </label>
              </div>
            )}
          </fieldset>

          <ImageField kind="logo" label="Logo" hint={`PNG, JPG or WebP, up to ${IMAGE_LIMITS.logo.label}.`} url={logoUrl} has={Boolean(draft.logo_path)} off={off} onPick={(f) => pick("logo", f)} onClear={() => clear("logo")} />

          <Field label="Welcome headline" htmlFor="brand-headline" counter={{ value: (draft.welcome_headline ?? "").length, max: HEADLINE_MAX }}>
            <Input id="brand-headline" value={draft.welcome_headline ?? ""} maxLength={HEADLINE_MAX} disabled={off} placeholder="Shown instead of the title on the start screen" onChange={(e) => set({ welcome_headline: e.target.value || null })} />
          </Field>
          <Field label="Thank-you message" htmlFor="brand-thanks" counter={{ value: (draft.thank_you ?? "").length, max: THANKS_MAX }}>
            <Textarea id="brand-thanks" rows={3} value={draft.thank_you ?? ""} maxLength={THANKS_MAX} disabled={off} onChange={(e) => set({ thank_you: e.target.value || null })} />
          </Field>



          {error && <Notice tone="error"><span role="alert" data-testid="brand-error">{error}</span></Notice>}
          <div className="ui-row">
            <Button variant="primary" onClick={() => void persist(draft)} disabled={off || !dirty || Boolean(check && !check.ok && !draft.follow_hub)} data-testid="brand-save">{busy ? "Saving…" : "Save branding"}</Button>
            {data.branding && <Button variant="ghost" onClick={() => void persist(null)} disabled={off} data-testid="brand-reset">Back to LunchVoice styling</Button>}
          </div>
        </div>

        <Preview title={d.campaign.title} theme={theme} logoUrl={logoUrl} coverUrl={coverUrl} width={width} setWidth={setWidth} />
      </div>
    </Card>
  );
}

function ImageField({ kind, label, hint, url, has, off, onPick, onClear }: {
  kind: ImageKind; label: string; hint: string; url: string | null; has: boolean; off: boolean; onPick: (f: File | undefined) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="lv-stack-8">
      <span className="lv-legend">{label}</span>
      <div className="ui-row">
        {url && <img src={url} alt="" className={`lv-brand-thumb lv-brand-thumb-${kind}`} />}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={label} disabled={off} data-testid={`brand-${kind}-file`}
          onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
        <Button variant="secondary" size="sm" disabled={off} onClick={() => ref.current?.click()}>{has ? "Replace" : "Upload"}</Button>
        {has && <Button variant="ghost" size="sm" disabled={off} onClick={onClear}>Remove</Button>}
      </div>
      <p className="ui-help lv-m0">{hint}</p>
    </div>
  );
}

/** The start and thank-you screens as the player draws them, at 375px or desktop width. */
function Preview({ title, theme, logoUrl, coverUrl, width, setWidth }: {
  title: string; theme: ReturnType<typeof resolveTheme>; logoUrl: string | null; coverUrl: string | null; width: "phone" | "desktop"; setWidth: (w: "phone" | "desktop") => void;
}) {
  const t = themeState(theme, logoUrl, coverUrl);
  const frame = (children: React.ReactNode) => (
    <div className={`lv-player lv-player-light lv-player-embedded lv-brand-screen${t.frameProps.className}`} style={t.frameProps.style} data-buttons={t.frameProps["data-buttons"]}>
      <div className="lv-player-body">{children}</div>
      {!t.hideFooter && <p className="lv-powered">Powered by LunchVoice</p>}
    </div>
  );
  return (
    <div className="lv-stack-12" data-testid="brand-preview">
      <div className="ui-row" role="group" aria-label="Preview width">
        <span className="lv-legend">Preview</span>
        <Button size="sm" variant={width === "phone" ? "primary" : "secondary"} aria-pressed={width === "phone"} onClick={() => setWidth("phone")}>375px</Button>
        <Button size="sm" variant={width === "desktop" ? "primary" : "secondary"} aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>Desktop</Button>
      </div>
      <div className={`lv-brand-frame lv-brand-frame-${width}`}>
        <p className="ui-help lv-m0">Start screen</p>
        {frame(
          <div className={`lv-player-hero${t.theme?.color ? " lv-pt-hero" : ""}`} data-testid="brand-preview-start">
            <BrandMedia t={t} />
            <h3 className="lv-player-title">{theme.welcome_headline || title}</h3>
            {theme.welcome_headline && <p className="lv-pt-subtitle">{title}</p>}
            <div className="lv-player-hero-foot"><span className="lv-row-sub">3 questions · ~1 min</span><Button variant="primary" tabIndex={-1}>Start</Button></div>
          </div>,
        )}
        <p className="ui-help lv-m0">Thank-you screen</p>
        {frame(
          <div className="lv-thanks" data-testid="brand-preview-thanks">
            {t.logoUrl && <BrandMedia t={t} cover={false} />}
            <h3 className="lv-thanks-title">Thanks.<br /><em>You’re heard.</em></h3>
            {theme.thank_you && <p className="lv-pt-message">{theme.thank_you}</p>}
          </div>,
        )}
      </div>
    </div>
  );
}
