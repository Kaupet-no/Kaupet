import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { shareContent } from "@/lib/native";
import { QR_SIZE, generateBrandedQrDataUrl } from "@/lib/qr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kaupetCode: string;
  title: string;
  isNative?: boolean;
};

export function ShareListingDialog({ open, onOpenChange, kaupetCode, title, isNative }: Props) {
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
        showSuccessToast("Kaupet-kode kopiert");
      } else {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1500);
        showSuccessToast("Lenke kopiert");
      }
    } catch {
      showErrorToast("Kunne ikke kopiere");
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
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-md">
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
            {!isNative && (
              <Button
                variant="outline"
                size="sm"
                onClick={downloadQr}
                disabled={!qrSrc}
                className="gap-2"
              >
                <Download className="size-4" /> Last ned QR-kode
              </Button>
            )}
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

          {/* Native share */}
          {isNative && (
            <Button
              type="button"
              className="w-full gap-2"
              onClick={async () => {
                try {
                  await shareContent({ title, url });
                } catch {
                  // Bruker avbrutt deling
                }
              }}
            >
              <Share2 className="size-4" /> Del med kontakter
            </Button>
          )}
        </div>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
