// Delt QR-kode-generering med Kaupets "k."-merke i midten — brukt både av
// delingsdialogen (share-listing-dialog.tsx) og 360°-QR-panelet
// (vehicle-360-qr-panel.tsx) slik at alle QR-koder vi viser i appen har
// samme gjenkjennelige merkevarebygging.

export const QR_SIZE = 320;
const BRAND_COLOR = "#2f5d44";
const LOGO_K_COLOR = "#f5f0e8";
const LOGO_DOT_COLOR = "#c96d2e";

async function generateQrDataUrl(url: string): Promise<string> {
  const mod = (await import("qrcode/lib/browser.js")) as {
    toDataURL?: (text: string, opts?: unknown) => Promise<string>;
    default?: { toDataURL?: (text: string, opts?: unknown) => Promise<string> };
  };
  const toDataURL = mod.toDataURL ?? mod.default?.toDataURL;
  if (typeof toDataURL !== "function") {
    throw new Error("QR-bibliotek mangler toDataURL");
  }
  return toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: QR_SIZE,
    color: { dark: "#0b1f17", light: "#ffffff" },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kunne ikke laste QR-bilde"));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generateBrandedQrDataUrl(url: string): Promise<string> {
  const qrDataUrl = await generateQrDataUrl(url);
  try {
    const img = await loadImage(qrDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = QR_SIZE;
    canvas.height = QR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return qrDataUrl;

    ctx.drawImage(img, 0, 0, QR_SIZE, QR_SIZE);

    const badge = Math.round(QR_SIZE * 0.22);
    const bx = (QR_SIZE - badge) / 2;
    const by = (QR_SIZE - badge) / 2;
    const radius = Math.round(badge * 0.22);

    ctx.fillStyle = BRAND_COLOR;
    drawRoundedRect(ctx, bx, by, badge, badge, radius);
    ctx.fill();

    // Draw "k." centered in the badge, dot acts as the period
    const fontSize = Math.round(badge * 0.72);
    ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // "k." centered as a unit in the badge
    const dotR = Math.round(badge * 0.07);
    const gap = dotR * 0.6;
    const kWidth = ctx.measureText("k").width;
    const totalWidth = kWidth + gap + dotR * 2;
    const kx = bx + (badge - totalWidth) / 2;
    const ky = by + badge * 0.55;

    ctx.fillStyle = LOGO_K_COLOR;
    ctx.fillText("k", kx, ky);

    const dotCx = kx + kWidth + gap + dotR;
    const dotCy = ky + fontSize * 0.25;
    ctx.fillStyle = LOGO_DOT_COLOR;
    ctx.beginPath();
    ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL("image/png");
  } catch {
    return qrDataUrl;
  }
}
