import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Trash2, Plus } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { republishListing } from "@/lib/listings.functions";
import { getMyActivePromotions } from "@/lib/promotions.functions";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { MarkSoldDialog } from "@/components/listing-detail/mark-sold-dialog";
import { useIsDemo } from "@/hooks/use-is-demo";
import { useIsNative } from "@/hooks/use-is-native";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatErrorMessage } from "@/lib/errors";
import { getMyWtbListings, deleteWtbListing } from "@/lib/wtb-listings.functions";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { NativePageHeader } from "@/components/native-page-header";
import { ListingRow, type Row } from "@/features/my-listings/listing-row";

export const Route = createFileRoute("/_authenticated/mine-annonser/")({
  head: () => ({
    meta: [
      { title: "Mine annonser — Kaupet.no" },
      { name: "description", content: "Administrer dine annonser på Kaupet.no." },
    ],
  }),
  component: MyListingsPage,
});

function MyListingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | "active" | "sold" | "draft" | "wtb">("all");
  const [publishWarning, setPublishWarning] = useState<{
    id: string;
    kaupetCode: string;
    missingTitle: boolean;
    missingCategory: boolean;
    missingDescription: boolean;
    missingLocation: boolean;
    missingPrice: boolean;
    missingImages: boolean;
  } | null>(null);
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [markSoldId, setMarkSoldId] = useState<string | null>(null);
  const { data: isDemo = false } = useIsDemo();
  const native = useIsNative();

  const fetchPromos = useServerFn(getMyActivePromotions);
  const { data: promos } = useQuery({
    queryKey: ["my-promotions"],
    queryFn: () => fetchPromos(),
  });

  const fetchMyWtb = useServerFn(getMyWtbListings);
  const deleteWtbFn = useServerFn(deleteWtbListing);
  const { data: wtbRows = [], isLoading: wtbLoading } = useQuery({
    queryKey: ["my-wtb-listings"],
    queryFn: () => fetchMyWtb(),
  });
  const deleteWtbMutation = useMutation({
    mutationFn: (id: string) => deleteWtbFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-wtb-listings"] });
      showSuccessToast("Ønskes kjøpt-annonsen er slettet");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke slette annonsen")),
  });
  const activePromoByListing = new Map<string, { expires_at: string | null; is_gift: boolean }>();
  for (const p of promos ?? []) {
    if (
      (p.status === "active" || p.status === "gifted") &&
      p.expires_at &&
      new Date(p.expires_at) > new Date()
    ) {
      activePromoByListing.set(p.listing_id, { expires_at: p.expires_at, is_gift: p.is_gift });
    }
  }

  const { data: rows, isLoading } = useQuery({
    queryKey: ["my-listings"],
    queryFn: async (): Promise<Row[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [];
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, description, category_id, status, price_nok, is_free, city, created_at, expires_at, listing_images(storage_path, sort_order)",
        )
        .eq("seller_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: counts, error: countsError } = await supabase.rpc("my_listing_counts");
      if (countsError) throw countsError;
      const countMap = new Map<string, { views: number; favs: number }>();
      for (const c of counts ?? []) {
        countMap.set(c.listing_id, {
          views: Number(c.view_count ?? 0),
          favs: Number(c.favorite_count ?? 0),
        });
      }
      return (data ?? []).map((l) => {
        const cover =
          (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]
            ?.storage_path ?? null;
        const c = countMap.get(l.id);
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          status: l.status as Row["status"],
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          category_id: l.category_id ?? null,
          description: l.description ?? null,
          view_count: c?.views ?? 0,
          favorite_count: c?.favs ?? 0,
          created_at: l.created_at,
          expires_at: l.expires_at,
          cover_path: cover,
        };
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Row["status"] }) => {
      const { error } = await supabase.from("listings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void hapticNotification("success");
      showSuccessToast("Status oppdatert");
    },
    onError: (e: Error) => {
      void hapticNotification("error");
      showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere status"));
    },
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void hapticNotification("success");
      showSuccessToast("Annonsen er slettet");
    },
    onError: (e: Error) => {
      void hapticNotification("error");
      showErrorToast(formatErrorMessage(e, "Kunne ikke slette annonsen"));
    },
  });

  const doRepublish = useServerFn(republishListing);
  const republish = useMutation({
    mutationFn: async (id: string) => {
      return doRepublish({ data: { id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      void hapticNotification("success");
      showSuccessToast("Annonsen er publisert på nytt i 30 nye dager");
    },
    onError: (e: Error) => {
      void hapticNotification("error");
      showErrorToast(formatErrorMessage(e, "Kunne ikke publisere annonsen på nytt"));
    },
  });

  const filtered = (rows ?? []).filter((r) => {
    if (tab === "all") return true;
    if (tab === "active") return r.status === "active";
    if (tab === "sold")
      return r.status === "sold" || r.status === "archived" || r.status === "expired";
    if (tab === "draft") return r.status === "draft";
    return true;
  });

  return (
    <>
      <NativePageHeader title="Mine annonser" backLabel="Meg" backTo="/meg" />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {!native && (
              <h1 className="font-display text-3xl tracking-tight max-sm:hidden">Mine annonser</h1>
            )}
            <p className="mt-1 text-muted-foreground">
              Rediger, marker som solgt, eller slett annonsene dine.
            </p>
          </div>
          {!native && (
            <Link to="/ny-annonse">
              <Button>
                <Plus className="size-4" /> Ny annonse
              </Button>
            </Link>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-6">
          {native ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
              {(
                [
                  { value: "all", label: `Alle (${rows?.length ?? 0})` },
                  {
                    value: "active",
                    label: `Aktive (${rows?.filter((r) => r.status === "active").length ?? 0})`,
                  },
                  {
                    value: "sold",
                    label: `Solgt (${rows?.filter((r) => r.status === "sold" || r.status === "archived" || r.status === "expired").length ?? 0})`,
                  },
                  {
                    value: "draft",
                    label: `Utkast (${rows?.filter((r) => r.status === "draft").length ?? 0})`,
                  },
                  {
                    value: "wtb",
                    label: `Ønskes kjøpt${wtbRows.length > 0 ? ` (${wtbRows.length})` : ""}`,
                  },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    void hapticImpact("light");
                    setTab(value);
                  }}
                  className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    tab === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <TabsList>
              <TabsTrigger value="all">Alle ({rows?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="active">Aktive</TabsTrigger>
              <TabsTrigger value="sold">Solgt / utløpt</TabsTrigger>
              <TabsTrigger value="draft">Utkast</TabsTrigger>
              <TabsTrigger value="wtb">
                Ønskes kjøpt{wtbRows.length > 0 ? ` (${wtbRows.length})` : ""}
              </TabsTrigger>
            </TabsList>
          )}
          {tab !== "wtb" && (
            <TabsContent value={tab} className="mt-6">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Laster annonser…
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title="Ingen annonser å vise her."
                  action={
                    <Link to="/ny-annonse">
                      <Button size="sm" variant="outline">
                        <Plus className="size-4" /> Opprett din første annonse
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {filtered.map((r) => (
                    <ListingRow
                      key={r.id}
                      row={r}
                      isDemo={isDemo}
                      activePromotion={activePromoByListing.get(r.id) ?? null}
                      onPromote={() => setPromoteId(r.id)}
                      onMarkSold={() => setMarkSoldId(r.id)}
                      onReactivate={() => updateStatus.mutate({ id: r.id, status: "active" })}
                      onRepublish={() => republish.mutate(r.id)}
                      onPublishDraft={() => {
                        const missingTitle = !r.title?.trim();
                        const missingCategory = !r.category_id;
                        const missingDescription = !r.description?.trim();
                        const missingLocation = !r.city?.trim();
                        const missingPrice = !r.is_free && r.price_nok === null;
                        const missingImages = r.cover_path === null;
                        if (
                          missingTitle ||
                          missingCategory ||
                          missingDescription ||
                          missingLocation ||
                          missingPrice ||
                          missingImages
                        ) {
                          setPublishWarning({
                            id: r.id,
                            kaupetCode: r.kaupet_code,
                            missingTitle,
                            missingCategory,
                            missingDescription,
                            missingLocation,
                            missingPrice,
                            missingImages,
                          });
                        } else {
                          republish.mutate(r.id);
                        }
                      }}
                      onDelete={() => deleteListing.mutate(r.id)}
                      busy={
                        updateStatus.isPending || deleteListing.isPending || republish.isPending
                      }
                    />
                  ))}
                </ul>
              )}
            </TabsContent>
          )}

          <TabsContent value="wtb" className="mt-6">
            {wtbLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Laster…
              </div>
            ) : wtbRows.length === 0 ? (
              <EmptyState
                title="Du har ingen ønskes kjøpt-annonser ennå."
                action={
                  <Link to="/ny-ok-annonse">
                    <Button size="sm" variant="outline">
                      <Plus className="size-4" /> Opprett ønskes kjøpt
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {wtbRows.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{w.title}</p>
                        {w.status === "fulfilled" && <Badge variant="secondary">Oppfylt</Badge>}
                      </div>
                      {w.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {w.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {w.categories && <span>{w.categories.name_nb}</span>}
                        {w.max_price_nok != null && (
                          <span>· Maks {w.max_price_nok.toLocaleString("nb-NO")} kr</span>
                        )}
                        <span>
                          ·{" "}
                          {formatDistanceToNow(new Date(w.created_at), {
                            addSuffix: true,
                            locale: nb,
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link to="/mine-annonser/ok/$id/rediger" params={{ id: w.id }}>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground"
                          aria-label="Rediger"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Slett"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Slett ønskes kjøpt-annonse?</AlertDialogTitle>
                            <AlertDialogDescription>Dette kan ikke angres.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Avbryt</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteWtbMutation.mutate(w.id)}>
                              Slett
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        {promoteId && (
          <PromoteListingDialog
            listingId={promoteId}
            open={!!promoteId}
            onOpenChange={(o) => !o && setPromoteId(null)}
          />
        )}

        {markSoldId && (
          <MarkSoldDialog
            listingId={markSoldId}
            open={!!markSoldId}
            onOpenChange={(o) => !o && setMarkSoldId(null)}
          />
        )}

        {publishWarning &&
          (() => {
            const hasBlockingIssues =
              publishWarning.missingTitle ||
              publishWarning.missingCategory ||
              publishWarning.missingDescription ||
              publishWarning.missingLocation;
            return (
              <AlertDialog open onOpenChange={(o) => !o && setPublishWarning(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Annonsen mangler informasjon</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div>
                        {hasBlockingIssues && (
                          <>
                            <p className="mb-2 font-medium">Må fylles inn før publisering:</p>
                            <ul className="list-disc pl-5 space-y-1 mb-3">
                              {publishWarning.missingTitle && <li>Tittel mangler</li>}
                              {publishWarning.missingCategory && <li>Kategori er ikke valgt</li>}
                              {publishWarning.missingDescription && <li>Beskrivelse mangler</li>}
                              {publishWarning.missingLocation && <li>Sted / lokasjon mangler</li>}
                            </ul>
                          </>
                        )}
                        {(publishWarning.missingImages || publishWarning.missingPrice) && (
                          <>
                            <p className="mb-2 font-medium">
                              {hasBlockingIssues
                                ? "Anbefalt å fylle inn:"
                                : "Følgende felter er ikke utfylt:"}
                            </p>
                            <ul className="list-disc pl-5 space-y-1">
                              {publishWarning.missingImages && <li>Ingen bilder lagt til</li>}
                              {publishWarning.missingPrice && <li>Ingen pris satt</li>}
                            </ul>
                          </>
                        )}
                        <p className="mt-3">
                          {hasBlockingIssues
                            ? "Gå til annonsen for å legge inn manglende informasjon."
                            : "Gå til annonsen for å legge inn manglende informasjon, eller publiser likevel."}
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-background text-foreground border border-input hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        void navigate({
                          to: "/$kaupetCode",
                          params: { kaupetCode: publishWarning.kaupetCode },
                          search: { edit: true },
                        });
                        setPublishWarning(null);
                      }}
                    >
                      Gå til annonsen
                    </AlertDialogAction>
                    {!hasBlockingIssues && (
                      <AlertDialogAction
                        onClick={() => {
                          republish.mutate(publishWarning.id);
                          setPublishWarning(null);
                        }}
                      >
                        Publiser likevel
                      </AlertDialogAction>
                    )}
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            );
          })()}
      </div>
    </>
  );
}
