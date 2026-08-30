import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Eye, Heart, Info, Loader2, Pencil, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { republishListing } from "@/lib/listings.functions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";

type Stats = { total_views: number; favorite_count: number } | undefined;
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
  editMode,
  onToggleEditMode,
  hasImages,
  isFree,
  hasPrice,
}: {
  listingId: string;
  status: string;
  stats: Stats;
  activePromotion: ActivePromotion;
  promoteOpen: boolean;
  onPromoteOpenChange: (open: boolean) => void;
  statsInfoOpen: boolean;
  onStatsInfoOpenChange: (open: boolean) => void;
  /** Whether inline editing is currently on for this listing. */
  editMode: boolean;
  onToggleEditMode: () => void;
  /** Used only to warn before publishing a draft that's missing images/price. */
  hasImages: boolean;
  isFree: boolean;
  hasPrice: boolean;
}) {
  const queryClient = useQueryClient();
  const [showPublishWarning, setShowPublishWarning] = useState(false);
  const doRepublish = useServerFn(republishListing);
  const publishDraft = useMutation({
    mutationFn: () => doRepublish({ data: { id: listingId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing"] });
      showSuccessToast("Annonsen er publisert!");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke publisere annonsen")),
  });

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-primary">
        Dette er din annonse
      </p>
      <Button
        className="mt-3 w-full gap-2"
        variant={editMode ? "secondary" : "default"}
        onClick={onToggleEditMode}
      >
        <Pencil className="size-4" /> {editMode ? "Ferdig redigert" : "Rediger annonse"}
      </Button>

      {status === "draft" && (
        <Alert variant="warning" className="mt-3 flex items-center gap-3 px-3 py-2.5">
          <AlertDescription className="flex-1">
            Dette er et utkast — bare du kan se den.
          </AlertDescription>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const missingPrice = !isFree && !hasPrice;
              const missingImages = !hasImages;
              if (missingPrice || missingImages) {
                setShowPublishWarning(true);
              } else {
                publishDraft.mutate();
              }
            }}
            disabled={publishDraft.isPending}
          >
            {publishDraft.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Publiser
          </Button>
        </Alert>
      )}

      <AlertDialog open={showPublishWarning} onOpenChange={setShowPublishWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annonsen mangler informasjon</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Følgende felter er ikke utfylt:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {!hasImages && <li>Ingen bilder lagt til</li>}
                  {!isFree && !hasPrice && <li>Ingen pris satt</li>}
                </ul>
                <p className="mt-3">Vil du publisere likevel, eller gå tilbake og fylle inn?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Gå tilbake</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowPublishWarning(false);
                publishDraft.mutate();
              }}
            >
              Publiser likevel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            Fremhev annonse
          </Button>
        ))}
      <PromoteListingDialog
        listingId={listingId}
        open={promoteOpen}
        onOpenChange={onPromoteOpenChange}
      />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-card p-2">
          <Eye className="mx-auto size-4 text-muted-foreground" />
          <dd className="mt-1 font-display text-lg leading-none">{stats?.total_views ?? "–"}</dd>
          <dt className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">Visninger</dt>
        </div>
        <div className="rounded-lg bg-card p-2">
          <Heart className="mx-auto size-4 text-muted-foreground" />
          <dd className="mt-1 font-display text-lg leading-none">{stats?.favorite_count ?? "–"}</dd>
          <dt className="mt-1 text-2xs uppercase tracking-wide text-muted-foreground">
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
                  åpnet, begrenset til én telling per nettverk per 30 minutter.
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
            <p className="mt-3 rounded-md bg-muted/60 p-2 text-xs leading-relaxed">
              Tallene kan være noe unøyaktige fordi vi ikke sporer brukere på tvers av nettlesere
              eller økter. Bytter noen nettleser eller rydder data, telles de på nytt.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
