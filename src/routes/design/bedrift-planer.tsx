import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Check,
  CircleHelp,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import {
  BUSINESS_PLANS,
  type BusinessPlan,
  type BusinessPlanConfig,
  type BusinessPlanFeature,
} from "@/features/business-account/plans";

function planConfig(plan: BusinessPlan): BusinessPlanConfig {
  return BUSINESS_PLANS[plan];
}

const plans: BusinessPlan[] = ["proff_basis", "proff"];
const sharedFeatureCount = 4;
const comparisonFeatures: readonly BusinessPlanFeature[] =
  planConfig("proff_basis").features.slice(sharedFeatureCount);
export const Route = createFileRoute("/design/bedrift-planer")({
  head: () => ({ meta: [{ title: "Bedriftsplaner — designutforskning — Kaupet.no" }] }),
  component: BusinessPlanDesignExploration,
});

function KaupetWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline tracking-tight ${compact ? "text-2xl" : "text-3xl"}`}
    >
      <span className="font-display font-semibold text-primary">kaupet</span>
      <span className={`font-display text-brand ${compact ? "text-2xl" : "text-3xl"}`}>.</span>
      <span className={`font-display text-muted-foreground ${compact ? "text-xl" : "text-2xl"}`}>
        no
      </span>
    </span>
  );
}

function LogoLockup({
  variant,
  plan,
}: {
  variant: "centered" | "rule" | "side";
  plan: "proff" | "basis";
}) {
  const isProff = plan === "proff";
  const labelClass = isProff
    ? "font-sans text-[0.68rem] font-semibold tracking-[0.08em] text-primary"
    : "font-sans text-[0.62rem] font-medium tracking-[0.08em] text-muted-foreground";

  if (variant === "side") {
    return (
      <div className="flex items-center gap-3">
        <KaupetWordmark compact />
        <span className="h-8 w-px bg-border" aria-hidden="true" />
        <span className="flex flex-col leading-none">
          <span className={labelClass}>Proff</span>
          {!isProff && (
            <span className="mt-1 text-[0.58rem] font-medium tracking-[0.08em] text-muted-foreground">
              Basis
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      className={
        variant === "centered" ? "flex flex-col items-center" : "flex flex-col items-start"
      }
    >
      <span
        className={
          variant === "centered"
            ? "mt-1 flex flex-col items-center"
            : "mt-2 flex flex-col items-start border-t border-primary/20 pt-1.5"
        }
      >
        <span className={labelClass}>Proff</span>
        {!isProff && (
          <span className="mt-1 text-[0.58rem] font-medium tracking-[0.08em] text-muted-foreground">
            Basis
          </span>
        )}
      </span>
    </div>
  );
}

function PlanBadge({ plan }: { plan: BusinessPlan }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] ${
        plan === "proff"
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      {plan === "proff" ? "Anbefalt" : "Start enkelt"}
    </span>
  );
}

function PlanMark({ plan }: { plan: BusinessPlan }) {
  return <LogoLockup variant="side" plan={plan === "proff" ? "proff" : "basis"} />;
}

function Price({ plan }: { plan: BusinessPlan }) {
  const config = planConfig(plan);
  return (
    <div className="flex items-end gap-2">
      <span className="font-display text-3xl tracking-tight tabular-nums">
        {config.monthlyPriceNok === 0 ? "Gratis" : "1 490 kr"}
      </span>
      {config.monthlyPriceNok > 0 && (
        <span className="pb-1 text-xs text-muted-foreground">/ måned eks. mva</span>
      )}
    </div>
  );
}

function FeatureLine({
  feature,
  compact = false,
}: {
  feature: BusinessPlanFeature;
  compact?: boolean;
}) {
  return (
    <li className={`flex gap-2.5 ${compact ? "text-xs" : "text-sm"}`}>
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
          feature.included ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {feature.included ? (
          <Check aria-hidden="true" className="size-3" />
        ) : (
          <span aria-hidden="true">–</span>
        )}
      </span>
      <span className={feature.included ? "text-foreground" : "text-muted-foreground"}>
        {feature.label}
        {feature.value && <span className="ml-1 font-semibold">· {feature.value}</span>}
        {feature.note && (
          <span className="block text-xs text-muted-foreground">{feature.note}</span>
        )}
      </span>
    </li>
  );
}

function ConceptLabel({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="font-mono text-xs text-brand-text">{number}</span>
      <div>
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ConceptOne() {
  return (
    <section id="konsept-1" className="scroll-mt-8 border-t border-border py-16 sm:py-20">
      <ConceptLabel
        number="01"
        title="Rolige sammenligningskort"
        description="To tydelige valg med samme grunnstruktur. Proff får anbefalingen; Basis får en verdig, lavterskel inngang."
      />
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => {
          const config = planConfig(plan);
          const isProff = plan === "proff";
          return (
            <article
              key={plan}
              className={`relative flex flex-col overflow-hidden rounded-2xl border ${
                isProff
                  ? "border-primary bg-card shadow-[0_16px_40px_-28px_var(--primary)]"
                  : "border-border bg-surface/60"
              }`}
            >
              {isProff && <div className="h-1 bg-brand" aria-hidden="true" />}
              <div className="flex flex-1 flex-col p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <PlanMark plan={plan} />
                  <PlanBadge plan={plan} />
                </div>
                <div className="mt-8 border-b border-border pb-6">
                  <Price plan={plan} />
                  <p className="mt-2 min-h-5 text-xs text-muted-foreground">
                    {config.trialText ?? "Ingen binding eller skjulte kostnader"}
                  </p>
                </div>
                <ul className="mt-6 space-y-3.5">
                  {config.features.slice(0, 7).map((feature) => (
                    <FeatureLine key={feature.label} feature={feature} />
                  ))}
                </ul>
                <a
                  href="#anbefaling"
                  className={`mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    isProff
                      ? "bg-primary text-primary-foreground"
                      : "border border-primary/30 text-primary"
                  }`}
                >
                  {isProff ? "Start prøveperiode" : "Velg Proff basis"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Styrke: kjent kortmønster · Risiko: fortsatt mye informasjon i hver kortflate
      </p>
    </section>
  );
}

function ConceptTwo() {
  const proffFeatures = planConfig("proff").features.slice(sharedFeatureCount);
  return (
    <section id="konsept-2" className="scroll-mt-8 border-t border-border py-16 sm:py-20">
      <ConceptLabel
        number="02"
        title="Én felles grunnmur"
        description="Felles funksjoner forklares én gang. Deretter ser brukeren bare hva som skiller planene, med en klar anbefaling."
      />
      <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-primary p-6 text-primary-foreground sm:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
              <ShieldCheck aria-hidden="true" className="size-4" /> Felles i begge planer
            </div>
            <h3 className="mt-10 max-w-sm font-display text-3xl leading-tight">
              Alt det grunnleggende for en bedriftskonto.
            </h3>
            <ul className="mt-8 space-y-4 text-sm text-primary-foreground/90">
              {planConfig("proff_basis")
                .features.slice(0, sharedFeatureCount)
                .map((feature) => (
                  <li key={feature.label} className="flex gap-3">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
                    <span>{feature.label}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-10 border-t border-primary-foreground/20 pt-4 text-xs text-primary-foreground/65">
              Samme trygge start. Velg hvor mye du vil bygge videre.
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="grid gap-8 sm:grid-cols-2">
              {[
                {
                  plan: "proff_basis" as const,
                  heading: "Start enkelt",
                  features: planConfig("proff_basis").features.slice(sharedFeatureCount),
                  cta: "Velg Proff basis",
                },
                {
                  plan: "proff" as const,
                  heading: "Bygg synlighet",
                  features: proffFeatures,
                  cta: "Start med Proff",
                },
              ].map((item) => (
                <div key={item.plan} className="flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {item.heading}
                      </p>
                      <h3 className="mt-2 font-display text-2xl">
                        {BUSINESS_PLANS[item.plan].name}
                      </h3>
                    </div>
                    {item.plan === "proff" && (
                      <span className="mt-1 size-2 rounded-full bg-brand" aria-label="Anbefalt" />
                    )}
                  </div>
                  <div className="mt-4">
                    <Price plan={item.plan} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {planConfig(item.plan).trialText ?? "Ingen binding eller skjulte kostnader"}
                    </p>
                  </div>
                  <ul className="mt-6 space-y-4 border-t border-border pt-5">
                    {item.features.map((feature) => (
                      <FeatureLine key={feature.label} feature={feature} compact />
                    ))}
                  </ul>
                  <a
                    href="#anbefaling"
                    className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-primary/30 px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {item.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Styrke: lavere repetisjon og god skumlesing · Risiko: mindre direkte side-ved-side
        sammenligning
      </p>
    </section>
  );
}

function ConceptThree() {
  return (
    <section id="konsept-3" className="scroll-mt-8 border-t border-border py-16 sm:py-20">
      <ConceptLabel
        number="03"
        title="Kompakt beslutningsbord"
        description="Pris og anbefaling kommer først. Funksjonene følger som en rolig, skannbar liste med én rad per forskjell."
      />
      <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid border-b border-border bg-surface/70 sm:grid-cols-[1fr_220px_220px]">
          <div className="hidden p-6 sm:block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Planene i korthet
            </p>
          </div>
          {plans.map((plan) => (
            <div
              key={plan}
              className={`p-6 ${plan === "proff" ? "border-l border-border bg-primary/[0.04]" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <PlanMark plan={plan} />
                <PlanBadge plan={plan} />
              </div>
              <div className="mt-5">
                <Price plan={plan} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {planConfig(plan).trialText ?? "Ingen binding eller skjulte kostnader"}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="divide-y divide-border">
          {comparisonFeatures.map((feature, index) => (
            <div key={feature.label} className="grid sm:grid-cols-[1fr_220px_220px]">
              <div className="p-5 sm:p-6">
                <p className="text-sm font-medium">{feature.label}</p>
                {feature.note && (
                  <p className="mt-1 text-xs text-muted-foreground">{feature.note}</p>
                )}
              </div>
              <div className="border-l border-border p-5 sm:p-6">
                <FeatureLine
                  feature={planConfig("proff_basis").features[index + sharedFeatureCount]}
                  compact
                />
              </div>
              <div className="border-l border-border bg-primary/[0.02] p-5 sm:p-6">
                <FeatureLine
                  feature={planConfig("proff").features[index + sharedFeatureCount]}
                  compact
                />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t border-border p-5 sm:grid-cols-[1fr_220px_220px] sm:p-6">
          <div className="hidden sm:block" />
          {plans.map((plan) => (
            <a
              key={plan}
              href="#anbefaling"
              className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${plan === "proff" ? "bg-primary text-primary-foreground" : "border border-primary/30 text-primary"}`}
            >
              {plan === "proff" ? "Start 30 dagers prøveperiode" : "Velg Proff basis"}
            </a>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Styrke: best for presis sammenligning · Risiko: krever god responsiv komprimering på mobil
      </p>
    </section>
  );
}

function LogoConcept({
  number,
  title,
  description,
  variant,
}: {
  number: string;
  title: string;
  description: string;
  variant: "centered" | "rule" | "side";
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-brand-text">{number}</span>
        <span className="text-xs text-muted-foreground">Logoretning</span>
      </div>
      <h3 className="mt-8 font-display text-2xl">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-7 grid gap-3">
        <div className="flex min-h-28 items-center justify-center rounded-xl border border-border bg-background">
          <LogoLockup variant={variant} plan="proff" />
        </div>
        <div className="flex min-h-28 items-center justify-center rounded-xl border border-border bg-surface/70">
          <LogoLockup variant={variant} plan="basis" />
        </div>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        Proff = tydelig signatur · basis = roligere sekundærnivå
      </p>
    </article>
  );
}

function BusinessPlanDesignExploration() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="#top" aria-label="Til toppen">
            <KaupetWordmark />
          </a>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Bedriftsplaner</span>
            <span className="rounded-full bg-secondary px-3 py-1.5 font-medium text-secondary-foreground">
              Designutforskning
            </span>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-text">
              <Sparkles aria-hidden="true" className="size-4" /> Planvalg for bedrifter
            </p>
            <h1 className="max-w-3xl font-display text-5xl leading-[0.98] tracking-tight sm:text-7xl">
              Tre roligere måter å velge bedriftsplan på.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              En visuell utforskning av hvordan Proff og Proff basis kan presenteres med mer ro,
              bedre sammenlignbarhet og en tydeligere Kaupet-signatur.
            </p>
          </div>
          <aside className="rounded-2xl border border-border bg-surface/70 p-6 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-text">
              Designpremiss
            </p>
            <p className="mt-4 font-display text-2xl leading-tight">
              La verdiforskjellen gjøre jobben — ikke flere dekorative elementer.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
              <div>
                <strong className="block font-display text-2xl text-foreground">02</strong>planer
              </div>
              <div>
                <strong className="block font-display text-2xl text-foreground">03</strong>retninger
              </div>
              <div>
                <strong className="block font-display text-2xl text-foreground">01</strong>
                anbefaling
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-3 border-y border-border py-5 sm:grid-cols-3 sm:gap-6">
          <div className="flex gap-3">
            <BarChart3 className="mt-0.5 size-5 text-brand-text" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Raskere skumlesing</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Pris, nivå og neste steg står samlet.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Users className="mt-0.5 size-5 text-brand-text" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Verdig basisvalg</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Nedtonet betyr ikke utydelig.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <CircleHelp className="mt-0.5 size-5 text-brand-text" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Ærlig forventning</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Prøveperiode og «kommer senere» er synlig.
              </p>
            </div>
          </div>
        </section>

        <nav aria-label="Designretninger" className="flex flex-wrap gap-2 py-8 text-sm">
          <a
            href="#konsept-1"
            className="rounded-full border border-border px-4 py-2 text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            01 · Kort
          </a>
          <a
            href="#konsept-2"
            className="rounded-full border border-border px-4 py-2 text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            02 · Grunnmur
          </a>
          <a
            href="#konsept-3"
            className="rounded-full border border-border px-4 py-2 text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            03 · Beslutningsbord
          </a>
          <a
            href="#logoer"
            className="rounded-full border border-border px-4 py-2 text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Logoer
          </a>
        </nav>

        <ConceptOne />
        <ConceptTwo />
        <ConceptThree />

        <section id="logoer" className="scroll-mt-8 border-t border-border py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="font-mono text-xs text-brand-text">LOGO · 03 RETNINGER</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
              Samme Kaupet. Tydelig plan.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Alle tre retninger bygger på dagens ordmerke. Proff står som hovedsignatur, mens basis
              beholder «Proff» og viser «Basis» som sekundært nivå under.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <LogoConcept
              number="01"
              title="Sentrert signatur"
              description="En ryddig, stablet låsing for kort, profil og onboarding."
              variant="centered"
            />
            <LogoConcept
              number="02"
              title="Planlinje"
              description="En diskret regel gir signaturen et mer redaksjonelt preg."
              variant="rule"
            />
            <LogoConcept
              number="03"
              title="Kaupet Proff"
              description="Kompakt for navigasjon, tabeller og flater med lite vertikal plass. Basis får Proff over Basis."
              variant="side"
            />
          </div>
        </section>

        <section id="anbefaling" className="scroll-mt-8 border-t border-border py-16 sm:py-20">
          <div className="rounded-2xl bg-primary p-7 text-primary-foreground sm:p-10 lg:flex lg:items-end lg:justify-between lg:gap-12">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/65">
                Anbefalt retning
              </p>
              <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
                Start med konsept 01 + logoretning 03.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-6 text-primary-foreground/80">
                Kortene er lettest å forstå i dagens flyt, og «Kaupet Proff»-låsen er tydelig uten å
                gjøre Kaupet-logoen tung. For basis beholdes Proff som hovednivå, med Basis under.
                Ta med prinsippet fra konsept 02: forklar fellesverdien én gang dersom innholdet
                vokser.
              </p>
            </div>
            <a
              href="#konsept-1"
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
            >
              Se kortene på nytt <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </div>
          <div className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
            <div className="border-l-2 border-brand pl-4">
              <p className="font-semibold">Bevar</p>
              <p className="mt-1 text-muted-foreground">
                Newsreader, Inter, DM Sans, Source Serif 4, krem, skoggrønn og terrakotta.
              </p>
            </div>
            <div className="border-l-2 border-brand pl-4">
              <p className="font-semibold">Forenkle</p>
              <p className="mt-1 text-muted-foreground">Vis forskjellene før alle detaljene.</p>
            </div>
            <div className="border-l-2 border-brand pl-4">
              <p className="font-semibold">Verifiser</p>
              <p className="mt-1 text-muted-foreground">
                Test valgforståelse med fem bedriftsbrukere.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Designutforskning · bedriftsplaner</span>
          <span>Kaupet.no · internt beslutningsgrunnlag</span>
        </div>
      </footer>
    </div>
  );
}
