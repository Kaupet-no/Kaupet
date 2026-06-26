import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { NativePageHeader } from "@/components/native-page-header";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bell,
  BellOff,
  Trash2,
  Search as SearchIcon,
  Plus,
  Pencil,
  SlidersHorizontal,
  MoreVertical,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import { toast } from "sonner";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { usePushStatus } from "@/lib/use-push-status";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PushEnablePrompt } from "@/components/push-enable-prompt";
import { AdvancedSearchSheet } from "@/components/advanced-search-sheet";
import { criteriaToValue, valueToCriteria } from "@/components/advanced-search-value";
import {
  deleteSavedSearch,
  listSavedSearches,
  listUnreadCountsBySearch,
  summarizeCriteria,
  updateSavedSearch,
  type SavedSearch,
  type SearchCriteria,
} from "@/lib/saved-searches";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/mine-sok")({
  head: () => ({ meta: [{ title: "Mine søk — Kaupet.no" }] }),
  component: MineSokPage,
});

function MineSokPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);
  const [renamingSearch, setRenamingSearch] = useState<SavedSearch | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const push = usePushStatus();

  const { data, isLoading } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
  });

  const { data: unreadCounts } = useQuery({
    queryKey: ["saved-search-unread-counts"],
    queryFn: listUnreadCountsBySearch,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data;
    },
  });

  const searches = data ?? [];
  const hasActiveNotify = searches.some((s) => s.notify);

  const toggleNotify = async (s: SavedSearch) => {
    await updateSavedSearch(s.id, { notify: !s.notify });
    qc.invalidateQueries({ queryKey: ["saved-searches"] });
    const turningOn = !s.notify;
    showSuccessToast(s.notify ? "Varsler slått av" : "Varsler slått på");
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
    qc.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
    showSuccessToast("Søk slettet");
  };

  const handleRename = async () => {
    if (!renamingSearch) return;
    const name = renameValue.trim();
    if (!name) {
      showErrorToast("Navnet kan ikke være tomt");
      return;
    }
    setRenaming(true);
    try {
      await updateSavedSearch(renamingSearch.id, { name });
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      setRenamingSearch(null);
      showSuccessToast("Navn oppdatert");
    } catch (e) {
      showErrorToast(formatErrorMessage(e, "Kunne ikke endre navn"));
    } finally {
      setRenaming(false);
    }
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
    <>
      <NativePageHeader title="Mine søk" backLabel="Meg" backTo="/meg" />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight max-sm:hidden">Mine søk</h1>
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

        {hasActiveNotify && (
          <div className="mt-6">
            <PushEnablePrompt variant="banner" />
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
                Gjør et søk på annonse-siden og lagre kriteriene dine.
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
              {searches.map((s) => {
                const unread = unreadCounts?.get(s.id) ?? 0;
                return (
                  <li key={s.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{s.name}</h3>
                          {unread > 0 && (
                            <Link
                              to="/varsler"
                              className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
                            >
                              {unread} {unread === 1 ? "nytt treff" : "nye treff"}
                            </Link>
                          )}
                        </div>
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
                      <div className="flex shrink-0 items-center gap-2">
                        <Button size="sm" onClick={() => runSearch(s.criteria)}>
                          <SearchIcon className="size-4" /> Kjør søk
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleNotify(s)}
                          aria-label={s.notify ? "Slå av varsler" : "Slå på varsler"}
                        >
                          {s.notify ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" aria-label="Flere valg">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingSearch(s)}>
                              <SlidersHorizontal className="size-4" /> Rediger filtre
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRenamingSearch(s);
                                setRenameValue(s.name);
                              }}
                            >
                              <Pencil className="size-4" /> Endre navn
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteId(s.id)}
                            >
                              <Trash2 className="size-4" /> Slett søk
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </li>
                );
              })}
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

        <Dialog open={renamingSearch !== null} onOpenChange={(o) => !o && setRenamingSearch(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Endre navn på søk</DialogTitle>
            </DialogHeader>
            <div>
              <Label htmlFor="rename-search-input">Navn</Label>
              <Input
                id="rename-search-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRenamingSearch(null)}>
                Avbryt
              </Button>
              <Button onClick={handleRename} disabled={renaming}>
                {renaming ? "Lagrer…" : "Lagre"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {editingSearch && (
          <AdvancedSearchSheet
            open={editingSearch !== null}
            onOpenChange={(o) => !o && setEditingSearch(null)}
            initial={criteriaToValue(editingSearch.criteria)}
            categories={categories ?? []}
            currentSort={editingSearch.criteria.sort}
            applyLabel="Lagre endringer"
            hideSaveAction
            onApply={async (v) => {
              try {
                await updateSavedSearch(editingSearch.id, { criteria: valueToCriteria(v) });
                qc.invalidateQueries({ queryKey: ["saved-searches"] });
                showSuccessToast("Søket er oppdatert");
              } catch (e) {
                showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere søket"));
              } finally {
                setEditingSearch(null);
              }
            }}
          />
        )}
      </div>
    </>
  );
}
