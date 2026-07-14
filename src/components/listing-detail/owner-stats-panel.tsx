import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Eye, Heart, Info, Pencil, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";

type Stats = { total_views: number; unique_visitors: number; favorite_count: number } | undefined;
type ActivePromotion = { id: string; status: string; expires_at: string | null } | null | undefined;

export function OwnerStatsPanel({
  listingId,
  status,
  stats,
  activePromotion,
  promoteOpen,
  onPromoteOpenChange,
  statsInfoOpen,
  onStatsInfoOpenChange,
}: {
  listingId: string;
  status: string;
  stats: Stats;
  activePromotion: ActivePromotion;
  promoteOpen: boolean;
  onPromoteOpenChange: (open: boolean) => void;
  statsInfoOpen: boolean;
  onStatsInfoOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-primary">
        Dette er din annonse
      </p>
      <Link to="/mine-annonser/$id/rediger" params={{ id: listingId }} className="mt-3 block">
        <Button className="w-full gap-2" variant="default">
          <Pencil className="size-4" /> Rediger annonse
        </Button>
      </Link>
      {status === "active" &&
        (activePromotion ? (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full gap-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
            disabled
          >
            <Check className="size-4" /> Annonse fremhevet
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full gap-2"
            onClick={() => onPromoteOpenChange(true)}
          >
            <Sparkles className="size-4" /> Fremhev annonse
          </Button>
        ))}
      <PromoteListingDialog
        listingId={listingId}
        open={promoteOpen}
        onOpenChange={onPromoteOpenChange}
      />
      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-card p-2">
          <Eye className="mx-auto size-4 text-muted-foreground" />
          <dd className="mt-1 font-display text-lg leading-none">{stats?.total_views ?? "–"}</dd>
          <dt className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Visninger
          </dt>
        </div>
        <div className="rounded-lg bg-card p-2">
          <Users className="mx-auto size-4 text-muted-foreground" />
          <dd className="mt-1 font-display text-lg leading-none">
            {stats?.unique_visitors ?? "–"}
          </dd>
          <dt className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Unike besøk
          </dt>
        </div>
        <div className="rounded-lg bg-card p-2">
          <Heart className="mx-auto size-4 text-muted-foreground" />
          <dd className="mt-1 font-display text-lg leading-none">{stats?.favorite_count ?? "–"}</dd>
          <dt className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Favoritter
          </dt>
        </div>
      </dl>
      <Collapsible
        open={statsInfoOpen}
        onOpenChange={onStatsInfoOpenChange}
        className="mt-4 rounded-lg bg-card"
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Info className="size-3.5 shrink-0 text-primary" />
              Hva betyr tallene?
            </span>
            <ChevronDown
              className={`size-3.5 shrink-0 transition-transform ${statsInfoOpen ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-3 pb-3 pt-2 text-xs text-muted-foreground">
            <ul className="space-y-2">
              <li className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-primary">•</span>
                <span>
                  <strong className="text-foreground">Visninger</strong> — antall ganger annonsen er
                  åpnet (ett oppslag per time).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-primary">•</span>
                <span>
                  <strong className="text-foreground">Unike besøk</strong> — antall distinkte
                  besøkende. Vi skiller brukere ved innlogget bruker-ID eller en tilfeldig nøkkel i
                  nettleseren. Samme person telles bare én gang.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-primary">•</span>
                <span>
                  <strong className="text-foreground">Favoritter</strong> — antall brukere som har
                  lagt annonsen i favoritter.
                </span>
              </li>
            </ul>
            <p className="mt-3 rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
              Tallene kan være noe unøyaktige fordi vi ikke sporer brukere på tvers av nettlesere
              eller økter. Bytter noen nettleser eller rydder data, telles de på nytt.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
