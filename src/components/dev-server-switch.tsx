import { useState } from "react";
import { Laptop } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STAGING_HOST } from "@/hooks/use-should-show-dev-server-switch";
import { localDevServerUrl } from "@/lib/dev-server-url";

export function DevServerSwitch() {
  const currentHost = window.location.host;
  const onStaging = currentHost === STAGING_HOST;
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const connectToLocal = () => {
    const url = localDevServerUrl(address);
    if (!url) {
      setError("Bruk localhost eller en privat IP-adresse med port.");
      return;
    }
    window.location.assign(url);
  };

  const backToStaging = () => {
    window.location.href = `https://${STAGING_HOST}`;
  };

  return (
    <div className="mt-6">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Utviklerverktøy
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <Laptop className="size-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Peker nå mot {onStaging ? "staging.kaupet.no" : currentHost}
            </p>
            {onStaging ? (
              <div className="mt-3 flex flex-col gap-2">
                <Input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setError("");
                  }}
                  placeholder="192.168.1.23:3000"
                  aria-label="IP-adresse og port til lokal dev-server"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={!!error}
                  aria-describedby={error ? "dev-server-address-error" : undefined}
                />
                {error && (
                  <p
                    id="dev-server-address-error"
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={connectToLocal}
                  disabled={!address.trim()}
                >
                  Koble til lokal server
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" className="mt-3" onClick={backToStaging}>
                Tilbake til staging.kaupet.no
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
