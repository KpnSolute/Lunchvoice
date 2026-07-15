import { useEffect, useState } from "react";
import { joinUrl, QR_DESTINATIONS, qrDataUrl, type QrDestination } from "../lib/qr";
import { useOrg } from "../org/OrgProvider";

// Shows the join code + a scannable QR that deep-links students into the session.
export function QRCard({ code }: { code: string }) {
  const { org } = useOrg();
  const [src, setSrc] = useState("");
  const [destination, setDestination] = useState<QrDestination>("campus");
  const selected = QR_DESTINATIONS[destination];
  const url = joinUrl(code, org.slug, selected.origin);

  useEffect(() => {
    qrDataUrl(url).then(setSrc);
  }, [url]);

  async function downloadQr() {
    const highResolution = await qrDataUrl(url, 1600, 4);
    const link = document.createElement("a");
    link.href = highResolution;
    link.download = `${org.slug.toLowerCase()}-session-${code.toLowerCase()}-${destination}.png`;
    link.click();
  }

  return (
    <div className="qr-card stack" style={{ alignItems: "center" }}>
      <div className="join-code">{code}</div>
      <label className="stack" style={{ width: "100%", gap: 5 }}>
        <span className="hint">QR destination</span>
        <select value={destination} onChange={(event) => setDestination(event.target.value as QrDestination)}>
          {Object.entries(QR_DESTINATIONS).map(([value, option]) => (
            <option key={value} value={value}>{option.label}</option>
          ))}
        </select>
      </label>
      {src && <img src={src} alt={`QR for ${code}`} width={240} height={240} />}
      <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13, padding: "6px 12px" }}
          onClick={() => navigator.clipboard.writeText(url)}
        >
          Copy join link
        </button>
        <button
          className="btn btn-solid"
          style={{ fontSize: 13, padding: "6px 12px" }}
          onClick={downloadQr}
        >
          Download flyer QR (PNG)
        </button>
      </div>
      <div className="muted center" style={{ fontSize: 12 }}>Scan to sign in or sign up, join this session, and open its survey directly.</div>
      <div className="muted mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{url}</div>
    </div>
  );
}
