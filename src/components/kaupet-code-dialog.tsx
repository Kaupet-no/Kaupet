import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Hash } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  trigger?: React.ReactNode;
};

export function KaupetCodeDialog({ trigger }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^[0-9]{8}$/.test(trimmed)) {
      showErrorToast("Koden må være 8 sifre");
      return;
    }
    setOpen(false);
    setCode("");
    navigate({ to: "/$kaupetCode", params: { kaupetCode: trimmed } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="lg" className="gap-2">
            <Hash className="size-4" />
            Har du en Kaupet-kode?
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Åpne annonse med Kaupet-kode</DialogTitle>
          <DialogDescription>
            Skriv inn de 8 sifrene fra koden for å hoppe rett til annonsen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kaupet-code">Kaupet-kode</Label>
            <Input
              id="kaupet-code"
              autoFocus
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              placeholder="12345678"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={code.length !== 8} className="w-full">
              Gå til annonse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
