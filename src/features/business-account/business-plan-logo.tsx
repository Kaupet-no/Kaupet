import type { BusinessPlan } from "./plans";

export function BusinessPlanLogo({ plan }: { plan: BusinessPlan }) {
  const isProff = plan === "proff";
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-baseline tracking-tight">
        <span className="font-display text-2xl font-semibold text-primary">kaupet</span>
        <span className="font-display text-2xl text-brand">.</span>
        <span className="font-display text-xl text-muted-foreground">no</span>
      </span>
      <span className="h-8 w-px bg-border" aria-hidden="true" />
      <span className="flex flex-col leading-none">
        <span
          className={
            isProff
              ? "font-sans text-[0.68rem] font-semibold tracking-[0.08em] text-primary"
              : "font-sans text-[0.62rem] font-medium tracking-[0.08em] text-muted-foreground"
          }
        >
          Proff
        </span>
        {!isProff && (
          <span className="mt-1 text-[0.58rem] font-medium tracking-[0.08em] text-muted-foreground">
            Basis
          </span>
        )}
      </span>
    </div>
  );
}
