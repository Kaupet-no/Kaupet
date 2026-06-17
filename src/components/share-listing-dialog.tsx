import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kaupetCode: string;
  title: string;
};

const QR_SIZE = 320;
const BRAND_COLOR = "#2f5d44";

async function generateQrDataUrl(url: string): Promise<string> {
  const mod: any = await import("qrcode/lib/browser.js");
  const toDataURL: (text: string, opts?: unknown) => Promise<string> =
    mod.toDataURL ?? mod.default?.toDataURL;
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

async function generateBrandedQrDataUrl(url: string): Promise<string> {
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

    ctx.fillStyle = "#ffffff";
    drawRoundedRect(ctx, bx, by, badge, badge, radius);
    ctx.fill();

    ctx.fillStyle = BRAND_COLOR;
    ctx.font = `600 ${Math.round(badge * 0.78)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("k", QR_SIZE / 2, QR_SIZE / 2 + badge * 0.04);

    return canvas.toDataURL("image/png");
  } catch {
    return qrDataUrl;
  }
}

export function ShareListingDialog({ open, onOpenChange, kaupetCode }: Props) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const url = `https://kaupet.no/${kaupetCode}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGenerating(true);
    setQrError(null);
    setQrSrc(null);
    generateBrandedQrDataUrl(url)
      .then((dataUrl) => {
        if (cancelled) return;
        setQrSrc(dataUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("QR generation failed", err);
        setQrError("Kunne ikke generere QR-kode");
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  async function copy(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "code") {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 1500);
        toast.success("Kaupet-kode kopiert");
      } else {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
        toast.success("Lenke kopiert");
      }
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  }

  function downloadQr() {
    if (!qrSrc) return;
    const a = document.createElement("a");
    a.href = qrSrc;
    a.download = `kaupet-${kaupetCode}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Del annonse</DialogTitle>
          <DialogDescription>Del annonsen med Kaupet-kode, lenke eller QR-kode.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div
              className="flex h-56 w-56 items-center justify-center rounded-md bg-white"
              aria-live="polite"
            >
              {generating && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
              {!generating && qrError && (
                <span className="px-3 text-center text-sm text-destructive">{qrError}</span>
              )}
              {!generating && qrSrc && (
                <img
                  src={qrSrc}
                  alt="QR-kode til annonsen"
                  width={QR_SIZE}
                  height={QR_SIZE}
                  className="h-56 w-56 rounded-md"
                />
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadQr}
              disabled={!qrSrc}
              className="gap-2"
            >
              <Download className="size-4" /> Last ned QR-kode
            </Button>
          </div>

          {/* Kaupet-kode */}
          <div className="space-y-1.5">
            <Label>Kaupet-kode</Label>
            <div className="flex gap-2">
              <div className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-center font-mono text-lg tracking-[0.3em]">
                {kaupetCode}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(kaupetCode, "code")}
                aria-label="Kopier Kaupet-kode"
              >
                {codeCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <Label htmlFor="share-url">Lenke</Label>
            <div className="flex gap-2">
              <Input id="share-url" value={url} readOnly className="font-mono text-sm" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copy(url, "link")}
                aria-label="Kopier lenke"
              >
                {linkCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
