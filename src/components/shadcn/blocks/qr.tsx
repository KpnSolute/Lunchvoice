import * as React from "react"
import { Skeleton } from "../skeleton"

/**
 * A QR code generated in the browser (no external QR service). The encoder is loaded on demand so it never weighs
 * on the first page load. Dark modules use the page text color via currentColor on a white quiet zone, so it scans
 * in every theme.
 */
export function QrCode({ value, label, size = 200 }: { value: string; label: string; size?: number }) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    let live = true
    setSvg(null)
    import("qrcode")
      .then((q) => q.toString(value, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#14110f", light: "#ffffff" } }))
      .then((s) => { if (live) setSvg(s) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [value])
  return (
    <figure className="m-0 flex flex-col items-start gap-2">
      {svg ? (
        <span
          role="img"
          aria-label={label}
          className="surface-card block overflow-hidden rounded-[18px] bg-white p-1.5 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : failed ? (
        <span className="surface-well grid place-items-center rounded-[18px] text-center text-[13px]" style={{ width: size, height: size }}>QR code unavailable. Share the link instead.</span>
      ) : (
        <Skeleton style={{ width: size, height: size }} />
      )}
    </figure>
  )
}
