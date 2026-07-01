import QRCode from "qrcode";

// Encodes a join URL into a QR data URL. // ponytail: qrcode lib, don't hand-roll.
export function joinUrl(code: string): string {
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 240, margin: 1, color: { dark: "#2B2622", light: "#FFFDF7" } });
}
