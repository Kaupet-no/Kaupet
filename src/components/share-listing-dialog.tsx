import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import QRCode from "qrcode/lib/browser";
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

async function drawQrWithLogo(canvas: HTMLCanvasElement, url: string) {
  const primaryColor = "#2f5d44"; // matches k-logo.svg

  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: QR_SIZE,
    color: { dark: "#0b1f17", light: "#ffffff" },
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;
  const badge = Math.round(size * 0.22);
  const x = (size - badge) / 2;
  const y = (size - badge) / 2;
  const radius = Math.round(badge * 0.22);

  // white rounded square behind the K
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + badge - radius, y);
  ctx.quadraticCurveTo(x + badge, y, x + badge, y + radius);
  ctx.lineTo(x + badge, y + badge - radius);
  ctx.quadraticCurveTo(x + badge, y + badge, x + badge - radius, y + badge);
  ctx.lineTo(x + radius, y + badge);
  ctx.quadraticCurveTo(x, y + badge, x, y + badge - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // K letter (matches k-logo.svg style)
  ctx.fillStyle = primaryColor;
  ctx.font = `600 ${Math.round(badge * 0.78)}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("k", size / 2, size / 2 + badge * 0.04);
}

export function ShareListingDialog({ open, onOpenChange, kaupetCode, title }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const url = `https://kaupet.no/${kaupetCode}`;

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    drawQrWithLogo(canvasRef.current, url).catch(() => {
      toast.error("Kunne ikke generere QR-kode");
    });
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

  async function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Kunne ikke lagre QR-kode");
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `kaupet-${kaupetCode}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }, "image/png");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Del annonse</DialogTitle>
          <DialogDescription>
            Del annonsen med Kaupet-kode, lenke eller QR-kode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* QR */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-4">
            <canvas
              ref={canvasRef}
              width={QR_SIZE}
              height={QR_SIZE}
              className="h-56 w-56 rounded-md"
              aria-label="QR-kode til annonsen"
            />
            <Button variant="outline" size="sm" onClick={downloadQr} className="gap-2">
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
