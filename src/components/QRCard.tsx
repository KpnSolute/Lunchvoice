import { useEffect, useState } from "react";
import { joinUrl, qrDataUrl } from "../lib/qr";
import { useOrg } from "../org/OrgProvider";

// Shows the join code + a scannable QR that deep-links students into the session.
export function QRCard({ code }: { code: string }) {
  const { org } = useOrg();
  const [src, setSrc] = useState("");
  const url = joinUrl(code, org.slug);

  useEffect(() => {
    qrDataUrl(url).then(setSrc);
  }, [url]);

  return (
    <div className="qr-card stack" style={{ alignItems: "center" }}>
      <div className="join-code">{code}</div>
      {src && <img src={src} alt={`QR for ${code}`} width={240} height={240} />}
      <button
        className="btn btn-ghost"
        style={{ fontSize: 13, padding: "6px 12px" }}
        onClick={() => navigator.clipboard.writeText(url)}
      >
        Copy join link
      </button>
      <div className="muted mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{url}</div>
    </div>
  );
}
