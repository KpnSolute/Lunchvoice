// Export the chart on screen as a PNG, entirely in the browser. Theme tokens are resolved to real colours first so the
// image looks the same as the page (light or dark). Nothing is uploaded.
function resolveVars(markup: string, el: Element): string {
  const cs = getComputedStyle(el);
  return markup.replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g, (_m, name: string) => cs.getPropertyValue(name).trim() || "#888");
}

export async function exportChartPng(host: HTMLElement, title: string, filename: string): Promise<void> {
  const svg = host.querySelector("svg.recharts-surface") as SVGSVGElement | null;
  if (!svg) throw new Error("No chart to export.");
  const box = svg.getBoundingClientRect();
  const w = Math.max(320, Math.round(box.width));
  const h = Math.round(box.height);
  const head = 56;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const markup = resolveVars(new XMLSerializer().serializeToString(clone), host);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("Could not draw the chart.")); img.src = url; });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = (h + head + 28) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw the chart.");
    ctx.scale(scale, scale);
    const cs = getComputedStyle(host);
    ctx.fillStyle = cs.getPropertyValue("--lv-surface").trim() || "#fff";
    ctx.fillRect(0, 0, w, h + head + 28);
    ctx.fillStyle = cs.getPropertyValue("--lv-text").trim() || "#111";
    ctx.font = "600 18px Geist, system-ui, sans-serif";
    ctx.fillText(title.length > 70 ? `${title.slice(0, 67)}...` : title, 16, 34);
    ctx.drawImage(img, 0, head);
    ctx.fillStyle = cs.getPropertyValue("--lv-subtle").trim() || "#666";
    ctx.font = "12px Geist, system-ui, sans-serif";
    ctx.fillText("Made with LunchVoice", 16, h + head + 18);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Could not make the image.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[^\w.-]+/g, "-").replace(/-+$/, "") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
