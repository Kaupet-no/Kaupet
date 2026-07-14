import { Heart, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const HOW_IT_WORKS_ITEMS = [
  {
    icon: Heart,
    title: "Finn noe du liker",
    body: "Søk etter brukte skatter fra hele Norge — eller bare nabolaget ditt.",
  },
  {
    icon: MapPin,
    title: "Møt selgeren",
    body: "Send en melding, avtal henting lokalt eller post i posten.",
  },
  {
    icon: ShieldCheck,
    title: "Trygt og åpent",
    body: "Kaupet.no utvikles som åpen kildekode. Du kan se nøyaktig hvordan dataene dine håndteres.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl tracking-tight">Slik fungerer det</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS_ITEMS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="size-5" />
              </div>
              <h3 className="font-display text-xl">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
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
              Kaupet.no bygges på åpen kildekode, med rett til personvern som et grunnprinsipp. Vi
              benytter derfor ingen sporende informasjonskapsler eller tredjeparts analyseverktøy.
            </p>
            <p>Ønsker du å bidra? Sjekk ut repoet på GitHub. Alle bidrag er hjertelig velkommen.</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <a href="https://github.com/Kaupet-no/kaupet" target="_blank" rel="noreferrer">
              <Button size="lg" variant="secondary">
                Bidra på GitHub
              </Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
