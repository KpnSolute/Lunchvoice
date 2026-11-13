// Survey branding API (000043). Shapes: docs/backend/API_CONTRACT.md, section "Survey branding (000043)".
import type { LvResult, LvTransport } from "./lvApi";
import { IMAGE_LIMITS, type ImageKind, type PlayerTheme, type SurveyBranding } from "./surveyTheme";

/** Storage access for branding images (Supabase Storage in production, an in-memory store in the dev mock). */
export interface BrandingStorage {
  upload(bucket: string, path: string, file: Blob, contentType: string): Promise<{ ok: boolean; message?: string }>;
  download(bucket: string, path: string): Promise<Blob | null>;
}

export interface BrandingInfo {
  branding: SurveyBranding | null;
  features: { branding: boolean; remove_footer: boolean };
  hub: { kind: "community" | "personal"; accent_hex: string | null };
}

type Caller = <T>(fn: string, args?: Record<string, unknown>) => Promise<LvResult<T>>;

export function brandingApi(transport: LvTransport & { storage?: BrandingStorage }, call: Caller) {
  return {
    brandingGet: (campaign: string) => call<BrandingInfo>("lv_campaign_branding_get", { p_campaign: campaign }),
    /** null resets the survey to LunchVoice styling. */
    brandingSet: (campaign: string, branding: SurveyBranding | null) =>
      call<{ branding: SurveyBranding | null }>("lv_campaign_branding_set", { p_campaign: campaign, p_branding: branding }),
    campaignTheme: (campaign: string) => call<{ theme: PlayerTheme | null }>("lv_campaign_theme", { p_campaign: campaign }),
    brandingUpload: async (kind: ImageKind, path: string, file: Blob, contentType: string): Promise<LvResult<{ path: string }>> => {
      if (!transport.storage) return { ok: false, error: { code: "lv_not_available", message: "Image upload is not available here." } };
      const r = await transport.storage.upload(IMAGE_LIMITS[kind].bucket, path, file, contentType);
      return r.ok ? { ok: true, path } : { ok: false, error: { code: "lv_invalid_input", message: r.message || "The image could not be uploaded." } };
    },
    /** The image as a blob: URL (the CSP allows blob: images; no third-party or cross-origin image is ever loaded). */
    brandingImageUrl: async (kind: ImageKind, path: string): Promise<string | null> => {
      const blob = await transport.storage?.download(IMAGE_LIMITS[kind].bucket, path).catch(() => null);
      return blob ? URL.createObjectURL(blob) : null;
    },
  };
}
