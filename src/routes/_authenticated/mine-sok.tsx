import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, BellOff, Trash2, Search as SearchIcon, Plus, BellRing, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";

import { usePushStatus } from "@/lib/use-push-status";

import { Button } from "@/components/ui/button";
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
import {
  deleteSavedSearch,
  listSavedSearches,
  summarizeCriteria,
  updateSavedSearch,
  type SavedSearch,
  type SearchCriteria,
} from "@/lib/saved-searches";

export const Route = createFileRoute("/_authenticated/mine-sok")({
  head: () => ({ meta: [{ title: "Mine søk — Kaupet.no" }] }),
  component: MineSokPage,
});

function MineSokPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const push = usePushStatus();
  const [enablingPush, setEnablingPush] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
  });

  const searches = data ?? [];
  const hasActiveNotify = searches.some((s) => s.notify);
  const showPushBanner =
    hasActiveNotify && !push.loading && !push.savedSearchesActive;

  const enablePush = async () => {
    setEnablingPush(true);
    try {
      await push.enableOnThisDevice("saved_searches");
      toast.success("Push-varsler er aktivert på denne enheten");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klarte ikke å aktivere varsler");
    } finally {
      setEnablingPush(false);
    }
  };

  const toggleNotify = async (s: SavedSearch) => {
    await updateSavedSearch(s.id, { notify: !s.notify });
    qc.invalidateQueries({ queryKey: ["saved-searches"] });
    const turningOn = !s.notify;
    toast.success(s.notify ? "Varsler slått av" : "Varsler slått på");
    if (turningOn && !push.savedSearchesActive) {
      if (!push.supported) {
        toast.message("Push-varsler er ikke tilgjengelig i denne nettleseren");
      } else if (push.permission === "denied") {
        toast.message("Push er blokkert i nettleseren — endre tillatelsen for å motta varsler her");
      } else {
        toast.message("Aktiver push-varsler øverst på siden for å motta dem på denne enheten");
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSavedSearch(deleteId);
    setDeleteId(null);
    qc.invalidateQueries({ queryKey: ["saved-searches"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("Søk slettet");
  };

  const runSearch = (c: SearchCriteria) => {
    navigate({
      to: "/annonser",
      search: {
        q: c.q ?? (c.terms ?? []).join(" "),
        qMode: c.qMode ?? "all",
        categories: c.categories ?? [],
        catMode: c.catMode ?? "any",
        conditions: c.conditions ?? [],
        includeFree: c.includeFree ?? true,
        min: c.min ?? undefined,
        max: c.max ?? undefined,
        sort: c.sort ?? "new",
        lat: c.lat ?? undefined,
        lng: c.lng ?? undefined,
        radius: c.radius ?? undefined,
        loc: c.loc,
      } as never,
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Mine søk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lagrede søk varsler deg automatisk når en ny annonse matcher.
          </p>
        </div>
        <Link to="/annonser" search={{ q: "", category: "", sort: "new" } as never}>
          <Button variant="outline">
            <Plus className="size-4" /> Nytt søk
          </Button>
        </Link>
      </div>

      {showPushBanner && (
        <div className="mt-6 flex gap-3 rounded-xl border border-border bg-card p-4">
          <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex-1 space-y-2 text-sm">
            {!push.supported ? (
              <p className="text-muted-foreground">
                Push-varsler er ikke tilgjengelig i denne nettleseren. Du vil ikke
                få varsler her, men kan motta dem på andre enheter der du er logget inn.
              </p>
            ) : push.permission === "denied" ? (
              <p className="text-muted-foreground">
                Du har blokkert varsler for kaupet.no. Endre tillatelsen i
                nettleserinnstillingene for å motta varsler her.
              </p>
            ) : !push.subscribedHere ? (
              <>
                <p className="font-medium">Aktiver push-varsler for å motta treffene</p>
                <p className="text-muted-foreground">
                  Du har lagrede søk med varsling på, men push-varsler er ikke aktivert
                  i nettleseren. Du vil ikke få beskjed når en ny annonse matcher.
                </p>
                <Button size="sm" onClick={enablePush} disabled={enablingPush}>
                  {enablingPush && <Loader2 className="size-4 animate-spin" />}
                  Aktiver push-varsler
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium">Push-varsler for lagrede søk er av</p>
                <p className="text-muted-foreground">
                  Slå på i profilen for å motta dem på denne enheten.
                </p>
                <Button size="sm" onClick={enablePush} disabled={enablingPush}>
                  {enablingPush && <Loader2 className="size-4 animate-spin" />}
                  Slå på for lagrede søk
                </Button>
              </>
            )}
            <p>
              <Link
                to="/profil"
                search={{ tab: "varslinger" } as never}
                className="text-xs underline underline-offset-2 text-muted-foreground"
              >
                Administrer varsler
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="mt-8">

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : searches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="text-lg font-medium">Ingen lagrede søk ennå</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bruk "Avansert søk" på annonse-siden og lagre kriteriene dine.
            </p>
            <Link
              to="/annonser"
              search={{ q: "", category: "", sort: "new" } as never}
              className="mt-4 inline-block"
            >
              <Button>
                <SearchIcon className="size-4" /> Gå til annonser
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {searches.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium">{s.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {summarizeCriteria(s.criteria)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Opprettet{" "}
                      {formatDistanceToNow(new Date(s.created_at), {
                        addSuffix: true,
                        locale: nb,
                      })}
                      {s.notify ? " · Varsler på" : " · Varsler av"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => runSearch(s.criteria)}>
                      <SearchIcon className="size-4" /> Kjør søk
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleNotify(s)}
                      aria-label={s.notify ? "Slå av varsler" : "Slå på varsler"}
                    >
                      {s.notify ? (
                        <>
                          <BellOff className="size-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Bell className="size-4" /> Aktiver
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteId(s.id)}
                      aria-label="Slett søk"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette lagret søk?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette sletter også alle varsler knyttet til søket. Handlingen kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
