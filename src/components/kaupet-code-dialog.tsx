import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Slot } from "@radix-ui/react-slot";
import { showErrorToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";

/** Dialogvarianten, brukt i app-skallet. Forsiden på web viser skjemaet
 * inline i stedet (se index.tsx). */
export function KaupetCodeDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Slot onClick={() => setOpen(true)}>{trigger}</Slot>
      <ResponsiveOverlay open={open} onOpenChange={setOpen}>
        <ResponsiveOverlayContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Åpne annonse med Kaupet-kode</DialogTitle>
            <DialogDescription>
              Skriv inn de 8 sifrene fra koden for å hoppe rett til annonsen.
            </DialogDescription>
          </DialogHeader>
          <KaupetCodeForm autoFocus onDone={() => setOpen(false)} />
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </>
  );
}

/** Kodefeltet og «Gå til annonse». `autoFocus` flytter fokus hver gang den
 * blir true — også når skjemaet allerede er montert (inline-panelet). */
export function KaupetCodeForm({
  autoFocus = false,
  onDone,
}: {
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^[0-9]{8}$/.test(trimmed)) {
      showErrorToast("Koden må være 8 sifre");
      return;
    }
    setCode("");
    onDone?.();
    navigate({ to: "/$kaupetCode", params: { kaupetCode: trimmed } });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="kaupet-code">Kaupet-kode</Label>
        <Input
          ref={inputRef}
          id="kaupet-code"
          inputMode="numeric"
          pattern="[0-9]{8}"
          maxLength={8}
          placeholder="12345678"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center font-mono text-lg tracking-[0.4em]"
        />
      </div>
      <Button type="submit" disabled={code.length !== 8} className="sm:w-auto">
        Gå til annonse
      </Button>
    </form>
  );
}
