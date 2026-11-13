import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { CampaignDetailData } from "../lib/lvApi";
import { useLv } from "../lib/useLv";
import {
  ANGLES, brandingProblem, checkBrandColor, EMPTY_BRANDING, GRADIENT_PRESETS, gradientCss, HEADLINE_MAX, imagePath, imageProblem,
  IMAGE_LIMITS, resolveTheme, sniffImage, THANKS_MAX, type BannerStyle, type ImageKind, type PatternKey, type SurveyBranding,
} from "../lib/surveyTheme";
import { BrandBanner, BrandMedia, themeState, useBlobUrl } from "../ui/PlayerTheme";
import { ColorSwatch } from "../ui/ColorPicker";
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
 * Survey branding (000043, gradients and cosmetics 000048), shared by the Studio (Campaigns) and the Quick Survey
 * editor. The theme belongs to this survey: a Hub Campaign can start from the Hub's color, or explicitly follow it, but
 * never has to. The server decides the plan on save (the Hub's plan or the creator's own Creator plan); this panel
 * explains it and previews both screens. Groups: Colors, Banner, Logo, Text, Style.
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
  const [local, setLocal] = useState<{ logo: string | null; cover: string | null }>({ logo: null, cover: null });
  const [savedUrls, setSavedUrls] = useState<{ logo: string | null; cover: string | null }>({ logo: null, cover: null });

  const data = info.data;
  useEffect(() => { if (data) { setDraft({ ...EMPTY_BRANDING, ...(data.branding ?? {}), cosmetics: { ...EMPTY_BRANDING.cosmetics, ...(data.branding?.cosmetics ?? {}) } }); setDirty(false); } }, [data]);
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
  const gradient = draft.style === "gradient";

  const c1 = draft.follow_hub && hubColor ? hubColor : draft.color;
  const check1 = c1 ? checkBrandColor(c1) : null;
  const check2 = gradient && draft.color2 ? checkBrandColor(draft.color2) : null;
  const blocked = Boolean((check1 && !check1.ok) || (check2 && !check2.ok));
  const set = (patch: Partial<SurveyBranding>) => { setDraft((b) => ({ ...b, ...patch })); setDirty(true); setError(null); };
  const setCos = (patch: Partial<SurveyBranding["cosmetics"]>) => set({ cosmetics: { ...draft.cosmetics, ...patch } });

  const logoUrl = local.logo ?? savedUrls.logo;
  const coverUrl = local.cover ?? savedUrls.cover;
  const theme = useMemo(() => resolveTheme({ ...draft, color: c1 ?? null }, null, canFooter), [draft, c1, canFooter]);

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

  const swatchBg1 = gradient && c1 && draft.color2 ? gradientCss(c1, draft.color2, draft.gradient_angle) : undefined;
  return (
    <Card data-testid="branding">
      <div className="ui-row lv-branding-head">
        <h2 className="lv-share-h">Branding</h2>
        {!allowed && <Badge variant="outline" data-testid="branding-locked"><Icon name="lock" size={12} />{isHub ? "Starter Hub or Creator Plus" : "Creator Plus"}</Badge>}
      </div>
      {!allowed ? (
        <div data-testid="branding-locked-note">
          <Notice>
            Your colors, logo and welcome message on this survey start with {isHub ? "a Starter Hub or " : ""}Creator Plus. Your survey works exactly as it is without them.{" "}
            <Link to="/pricing" className="ui-link">See plans</Link>
          </Notice>
        </div>
      ) : (
        <p className="ui-help lv-m0">This look belongs to this survey only. It never changes your anonymity settings, questions or answers.</p>
      )}
      {archived && <Notice>An archived survey can no longer be changed.</Notice>}

      <div className="lv-branding-grid">
        <Preview title={d.campaign.title} theme={theme} logoUrl={logoUrl} coverUrl={coverUrl} width={width} setWidth={setWidth} />

        <div className="lv-stack-24 lv-branding-controls">
          <fieldset className="lv-bgroup" disabled={off}>
            <legend className="lv-bgroup-h">Colors</legend>
            <div className="ui-row" role="group" aria-label="Look">
              {(["solid", "gradient"] as const).map((s) => (
                <Button key={s} size="sm" variant={draft.style === s ? "primary" : "secondary"} aria-pressed={draft.style === s} disabled={off}
                  onClick={() => set({ style: s, color2: s === "gradient" ? draft.color2 ?? (c1 ? GRADIENT_PRESETS[0]!.to : null) : null })} data-testid={`brand-look-${s}`}>
                  {s === "solid" ? "Solid" : "Gradient"}
                </Button>
              ))}
            </div>
            <div className="lv-swatches-row">
              <ColorSwatch label={gradient ? "Primary" : "Brand color"} value={c1 ?? null} background={swatchBg1} disabled={off || draft.follow_hub} onChange={(hex) => set({ color: hex })} testId="brand-swatch-primary" />
              {gradient && <ColorSwatch label="Accent" value={draft.color2} disabled={off} onChange={(hex) => set({ color2: hex })} testId="brand-swatch-accent" />}
            </div>
            {[check1 && { c: check1, who: "Primary" }, check2 && { c: check2, who: "Accent" }].filter((x): x is { c: NonNullable<typeof check1>; who: string } => Boolean(x)).map(({ c, who }) =>
              c.ok
                ? <p key={who} className="ui-help lv-m0" data-testid="brand-contrast-ok">{who} is readable: {c.ratio.toFixed(1)}:1 on white (WCAG AA needs 4.5:1).</p>
                : <div key={who} className="lv-stack-8" data-testid="brand-contrast-bad">
                    <p className="ui-help lv-m0" role="alert">{who} is too light: {c.ratio.toFixed(1)}:1 on white. Text and buttons in this color would be hard to read, so it can’t be saved.</p>
                    {c.suggestion && <Button variant="secondary" size="sm" onClick={() => set(who === "Primary" ? { color: c.suggestion } : { color2: c.suggestion })} data-testid="brand-use-suggestion">Use the closest readable shade ({c.suggestion})</Button>}
                  </div>,
            )}
            {gradient && (
              <>
                <div className="lv-stack-8">
                  <span className="lv-legend">Direction</span>
                  <div className="ui-row" role="group" aria-label="Gradient direction">
                    {ANGLES.map((a) => (
                      <Button key={a.key} size="sm" variant={draft.gradient_angle === a.angle ? "primary" : "secondary"} aria-pressed={draft.gradient_angle === a.angle} disabled={off} onClick={() => set({ gradient_angle: a.angle })} data-testid={`brand-angle-${a.key}`}>{a.label}</Button>
                    ))}
                  </div>
                </div>
                <div className="lv-stack-8">
                  <span className="lv-legend">Gradient presets</span>
                  <div className="lv-gradient-presets">
                    {GRADIENT_PRESETS.map((g) => (
                      <button key={g.key} type="button" className="lv-gradient-chip" style={{ background: gradientCss(g.from, g.to, g.angle) }} disabled={off || draft.follow_hub}
                        aria-label={`${g.label} gradient`} title={g.label} onClick={() => set({ color: g.from, color2: g.to, gradient_angle: g.angle })} data-testid={`brand-gradient-${g.key}`} />
                    ))}
                  </div>
                </div>
              </>
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

          <fieldset className="lv-bgroup" disabled={off}>
            <legend className="lv-bgroup-h">Banner</legend>
            <div className="ui-row" role="group" aria-label="Banner style">
              {([["fill", gradient ? "Gradient" : "Color"], ["pattern", "Pattern"], ["logo", "Logo only"]] as [BannerStyle, string][]).map(([k, label]) => (
                <Button key={k} size="sm" variant={draft.banner_style === k ? "primary" : "secondary"} aria-pressed={draft.banner_style === k} disabled={off}
                  onClick={() => set({ banner_style: k, cosmetics: { ...draft.cosmetics, pattern: k === "pattern" && draft.cosmetics.pattern === "none" ? "dots" : draft.cosmetics.pattern } })} data-testid={`brand-banner-${k}`}>{label}</Button>
              ))}
            </div>
            {draft.banner_style === "pattern" && (
              <div className="ui-row" role="group" aria-label="Pattern">
                {(["dots", "grid", "waves"] as PatternKey[]).map((p) => (
                  <Button key={p} size="sm" variant={draft.cosmetics.pattern === p ? "primary" : "secondary"} aria-pressed={draft.cosmetics.pattern === p} disabled={off} onClick={() => setCos({ pattern: p })} data-testid={`brand-pattern-${p}`}>{p[0]!.toUpperCase() + p.slice(1)}</Button>
                ))}
              </div>
            )}
            <ImageField kind="cover" label="Cover image (optional)" hint={`PNG, JPG or WebP, up to ${IMAGE_LIMITS.cover.label}.`} url={coverUrl} has={Boolean(draft.cover_path)} off={off} onPick={(f) => pick("cover", f)} onClear={() => clear("cover")} />
          </fieldset>

          <fieldset className="lv-bgroup" disabled={off}>
            <legend className="lv-bgroup-h">Logo</legend>
            <label className="ui-row lv-switch-row">
              <Switch checked={draft.cosmetics.logo_shadow} onCheckedChange={(v) => setCos({ logo_shadow: v })} disabled={off} aria-label="Soft shadow behind the logo" data-testid="brand-logo-shadow" />
              <span>Soft shadow behind the logo. Off by default; it can help a dark logo on a dark color.</span>
            </label>
            <ImageField kind="logo" label="Logo" hint={`PNG, JPG or WebP, up to ${IMAGE_LIMITS.logo.label}. Shown as it is, on your banner color; a transparent PNG works best.`} url={logoUrl} has={Boolean(draft.logo_path)} off={off} onPick={(f) => pick("logo", f)} onClear={() => clear("logo")} />
          </fieldset>

          <fieldset className="lv-bgroup" disabled={off}>
            <legend className="lv-bgroup-h">Text</legend>
            <Field label="Welcome headline" htmlFor="brand-headline" counter={{ value: (draft.welcome_headline ?? "").length, max: HEADLINE_MAX }}>
              <Input id="brand-headline" value={draft.welcome_headline ?? ""} maxLength={HEADLINE_MAX} disabled={off} placeholder="Shown instead of the title on the start screen" onChange={(e) => set({ welcome_headline: e.target.value || null })} />
            </Field>
            <Field label="Thank-you message" htmlFor="brand-thanks" counter={{ value: (draft.thank_you ?? "").length, max: THANKS_MAX }}>
              <Textarea id="brand-thanks" rows={3} value={draft.thank_you ?? ""} maxLength={THANKS_MAX} disabled={off} onChange={(e) => set({ thank_you: e.target.value || null })} />
            </Field>
          </fieldset>

          <fieldset className="lv-bgroup" disabled={off}>
            <legend className="lv-bgroup-h">Style</legend>
            <div className="lv-stack-8">
              <span className="lv-legend">Corners</span>
              <div className="ui-row" role="group" aria-label="Corner style">
                {(["rounded", "pill"] as const).map((s) => (
                  <Button key={s} size="sm" variant={draft.button_style === s ? "primary" : "secondary"} aria-pressed={draft.button_style === s} disabled={off} onClick={() => set({ button_style: s })} data-testid={`brand-buttons-${s}`}>{s === "rounded" ? "Rounded" : "Pill"}</Button>
                ))}
              </div>
            </div>
            <label className="ui-row lv-switch-row">
              <Switch checked={draft.cosmetics.progress_tint} onCheckedChange={(v) => setCos({ progress_tint: v })} disabled={off} aria-label="Tint the progress bar" data-testid="brand-progress" />
              <span>Tint the progress bar with your color</span>
            </label>
            <label className="ui-row lv-switch-row">
              <Switch checked={draft.cosmetics.glow} onCheckedChange={(v) => setCos({ glow: v })} disabled={off} aria-label="Soft glow on the welcome card" data-testid="brand-glow" />
              <span>Soft glow on the welcome card. The shine plays once, and never when motion is reduced.</span>
            </label>
            <label className="ui-row lv-switch-row">
              <Switch checked={draft.hide_footer && canFooter} onCheckedChange={(v) => set({ hide_footer: v })} disabled={off || !canFooter} aria-label="Hide the LunchVoice footer" data-testid="brand-hide-footer" />
              <span>Hide the “Powered by LunchVoice” footer {!canFooter && <Badge variant="outline"><Icon name="lock" size={12} />Creator Pro or Team Hub</Badge>}</span>
            </label>
          </fieldset>

          {error && <Notice tone="error"><span role="alert" data-testid="brand-error">{error}</span></Notice>}
          <div className="ui-row">
            <Button variant="primary" onClick={() => void persist(draft)} disabled={off || !dirty || blocked} data-testid="brand-save">{busy ? "Saving…" : "Save branding"}</Button>
            {data.branding && <Button variant="ghost" onClick={() => void persist(null)} disabled={off} data-testid="brand-reset">Back to LunchVoice styling</Button>}
          </div>
        </div>
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
  const frame = (children: React.ReactNode, tone: "light" | "ink" = "light") => (
    <div className={`lv-player lv-player-${tone} lv-player-embedded lv-brand-screen${t.frameProps.className}`} style={t.frameProps.style} {...t.frameProps.attrs}>
      <div className="lv-player-body">{children}</div>
      {!t.hideFooter && <p className="lv-powered">Powered by LunchVoice</p>}
    </div>
  );
  return (
    <div className="lv-stack-12 lv-branding-preview" data-testid="brand-preview">
      <div className="ui-row" role="group" aria-label="Preview width">
        <span className="lv-legend">Preview</span>
        <Button size="sm" variant={width === "phone" ? "primary" : "secondary"} aria-pressed={width === "phone"} onClick={() => setWidth("phone")}>375px</Button>
        <Button size="sm" variant={width === "desktop" ? "primary" : "secondary"} aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>Desktop</Button>
      </div>
      <div className={`lv-brand-frame lv-brand-frame-${width}`}>
        <p className="ui-help lv-m0">Start screen</p>
        {frame(
          <div className={`lv-player-hero${t.theme?.color && theme.banner_style !== "logo" ? " lv-pt-hero" : ""}`} data-testid="brand-preview-start">
            <BrandMedia t={t} />
            <h3 className="lv-player-title">{theme.welcome_headline || title}</h3>
            {theme.welcome_headline && <p className="lv-pt-subtitle">{title}</p>}
            <div className="lv-player-hero-foot"><span className="lv-row-sub" style={{ color: "inherit", opacity: 0.8 }}>3 questions · ~1 min</span><Button variant="primary" tabIndex={-1}>Start</Button></div>
          </div>,
        )}
        <p className="ui-help lv-m0">Thank-you screen</p>
        {frame(
          <div className="lv-thanks" data-testid="brand-preview-thanks">
            <BrandBanner t={t} />
            <h3 className="lv-thanks-title">Thanks.<br /><em>You’re heard.</em></h3>
            {theme.thank_you && <p className="lv-pt-message">{theme.thank_you}</p>}
          </div>,
          "ink",
        )}
      </div>
    </div>
  );
}
