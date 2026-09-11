import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRIVACY_POINTS = [
  "Ingen sporing av brukeraktivitet eller eksterne analyseverktøy",
  "Ingen markedsførings- eller adferdsdata å selge videre",
  "Kildekoden er offentlig — sjekk selv",
];

export function HowItWorksSection() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-10 md:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="text-brand-text mb-3 block text-xs font-semibold tracking-wide uppercase">
              En litt annerledes markedsplass
            </span>
            <h2 className="font-display text-3xl tracking-tight md:text-4xl">
              Bygget for et fritt og åpent internett
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Kaupet er bygget rundt et enkelt prinsipp: Minst mulig data om deg, mest mulig åpenhet
              i koden. Det vi ikke samler inn, kan vi heller ikke selge, miste eller misbruke.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {PRIVACY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm">
                  <Check className="text-brand-text mt-0.5 size-4 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
              <div className="size-2.5 rounded-full bg-border" />
              <div className="size-2.5 rounded-full bg-border" />
              <div className="size-2.5 rounded-full bg-border" />
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                github.com/kaupet-no/kaupet
              </span>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-7 text-foreground">
              <span className="text-muted-foreground">{"// analytics.ts"}</span>
              {"\n"}
              <span className="text-brand-text">export const</span> trackers = [];
              {"\n"}
              <span className="text-muted-foreground">{"// ingen tredjeparts sporing"}</span>
              {"\n\n"}
              <span className="text-brand-text">export function</span> collectUserData() {"{"}
              {"\n  "}
              <span className="text-brand-text">return</span> null;{" "}
              <span className="text-muted-foreground">
                {"// vi lagrer kun det vi må, ikke mer"}
              </span>
              {"\n"}
              {"}"}
              {"\n\n"}
              <span className="text-muted-foreground">
                {"// lisens: AGPL-3.0 — fritt å lese, dele, bygge videre på"}
              </span>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export function OpenSourceCtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="overflow-hidden rounded-3xl border border-border bg-primary px-8 py-12 text-primary-foreground md:px-16 md:py-16">
        <div className="grid items-center gap-8 md:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="font-display text-3xl tracking-tight md:text-4xl">
              Et alternativ vi bygger sammen.
            </h2>
            <p className="mt-3 max-w-xl opacity-90">
              Ønsker du å bidra? Sjekk ut repoet på GitHub. Alle bidrag er hjertelig velkommen.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild size="lg" variant="secondary">
              <a href="https://github.com/Kaupet-no/kaupet" target="_blank" rel="noreferrer">
                Bidra på GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
