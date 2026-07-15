import QRCode from "qrcode";

export const QR_DESTINATIONS = {
  campus: {
    label: "Campus-compatible Render link",
    origin: "https://interact-3npi.onrender.com",
  },
  public: {
    label: "Public Lunchvoice link",
    origin: "https://lunchvoice.com",
  },
} as const;

export type QrDestination = keyof typeof QR_DESTINATIONS;

// Encodes a join URL into a QR data URL. // ponytail: qrcode lib, don't hand-roll.
export function joinUrl(code: string, orgSlug?: string, origin = window.location.origin): string {
  const basePath = orgSlug ? `/${encodeURIComponent(orgSlug)}/join` : "/join";
  return `${origin.replace(/\/+$/, "")}${basePath}?code=${encodeURIComponent(code.trim().toUpperCase())}`;
}

export async function qrDataUrl(text: string, width = 240, margin = 1): Promise<string> {
  return QRCode.toDataURL(text, {
    width,
    margin,
    errorCorrectionLevel: "H",
    color: { dark: "#2B2622", light: "#FFFDF7" },
  });
}
