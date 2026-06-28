import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Plus,
  Eye,
  Heart,
  Clock,
  Sparkles,
  Check,
  Send,
  MoreVertical,
} from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";
import { republishListing } from "@/lib/listings.functions";
import { getMyActivePromotions } from "@/lib/promotions.functions";
import { PromoteListingDialog } from "@/components/promote-listing-dialog";
import { useIsDemo } from "@/lib/use-is-demo";
import { useIsNative } from "@/lib/use-is-native";
import { hapticImpact, hapticNotification } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatPrice } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/constants";
import { getMyWtbListings, deleteWtbListing } from "@/lib/wtb-listings.functions";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { NativePageHeader } from "@/components/native-page-header";

export const Route = createFileRoute("/_authenticated/mine-annonser/")({
  head: () => ({
    meta: [
      { title: "Mine annonser — Kaupet.no" },
      { name: "description", content: "Administrer dine annonser på Kaupet.no." },
    ],
  }),
  component: MyListingsPage,
});

type Row = {
  id: string;
  kaupet_code: string;
  title: string;
  status: "draft" | "active" | "sold" | "archived" | "expired";
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  category_id: string | null;
  description: string | null;
  view_count: number;
  favorite_count: number;
  created_at: string;
  expires_at: string | null;
  cover_path: string | null;
};

function daysLeft(expires_at: string | null): number | null {
  if (!expires_at) return null;
  const ms = new Date(expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function MyListingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | "active" | "sold" | "draft" | "wtb">("all");
  const [publishWarning, setPublishWarning] = useState<{
    id: string;
    missingTitle: boolean;
    missingCategory: boolean;
    missingDescription: boolean;
    missingLocation: boolean;
    missingPrice: boolean;
    missingImages: boolean;
  } | null>(null);
  const [promoteId, setPromoteId] = useState<string | null>(null);
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
                <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">Ingen annonser å vise her.</p>
                  <Link to="/ny-annonse" className="mt-4 inline-block">
                    <Button size="sm" variant="outline">
                      <Plus className="size-4" /> Opprett din første annonse
                    </Button>
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {filtered.map((r) => (
                    <ListingRow
                      key={r.id}
                      row={r}
                      isDemo={isDemo}
                      activePromotion={activePromoByListing.get(r.id) ?? null}
                      onPromote={() => setPromoteId(r.id)}
                      onMarkSold={() => updateStatus.mutate({ id: r.id, status: "sold" })}
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
              <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Du har ingen ønskes kjøpt-annonser ennå.
                </p>
                <Link to="/ny-ok-annonse" className="mt-4 inline-block">
                  <Button size="sm" variant="outline">
                    <Plus className="size-4" /> Opprett ønskes kjøpt
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-3">
                {wtbRows.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{w.title}</p>
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
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
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
                          to: "/mine-annonser/$id/rediger",
                          params: { id: publishWarning.id },
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

function ListingRow({
  row,
  isDemo,
  activePromotion,
  onPromote,
  onMarkSold,
  onReactivate,
  onRepublish,
  onPublishDraft,
  onDelete,
  busy,
}: {
  row: Row;
  isDemo: boolean;
  activePromotion: { expires_at: string | null; is_gift: boolean } | null;
  onPromote: () => void;
  onMarkSold: () => void;
  onReactivate: () => void;
  onRepublish: () => void;
  onPublishDraft: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const native = useIsNative();

  useEffect(() => {
    if (!row.cover_path) return;
    let cancelled = false;
    signListingImageUrls([row.cover_path]).then((m) => {
      if (!cancelled) setImgUrl(m[row.cover_path!] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [row.cover_path]);

  const d = daysLeft(row.expires_at);
  const expiryTone =
    d != null && d <= 2
      ? "border-destructive/40 text-destructive"
      : d != null && d <= 7
        ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
        : "border-border text-muted-foreground";

  const statusBadges = (
    <>
      <Badge variant={row.status === "active" ? "default" : "secondary"} className="text-xs">
        {STATUS_LABEL[row.status]}
      </Badge>
      {row.status === "active" && d != null && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${expiryTone}`}
        >
          <Clock className="size-3" />
          {d === 0 ? "Utløper i dag" : `${d} ${d === 1 ? "dag" : "dager"} igjen`}
        </span>
      )}
      {row.status === "expired" && (
        <span className="text-xs text-muted-foreground">Publiser på nytt for 30 nye dager</span>
      )}
      {row.status === "draft" && (
        <span className="text-xs text-muted-foreground">Ikke publisert</span>
      )}
      {activePromotion && (
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent">
          <Sparkles className="size-3" />
          {activePromotion.is_gift ? "Gratis fremhevet" : "Fremhevet"} til{" "}
          {activePromotion.expires_at
            ? new Date(activePromotion.expires_at).toLocaleDateString("nb-NO", {
                day: "2-digit",
                month: "short",
              })
            : ""}
        </span>
      )}
    </>
  );

  const deleteDialog = (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slette annonsen?</AlertDialogTitle>
          <AlertDialogDescription>
            Dette kan ikke angres. Annonsen «{row.title}» blir fjernet permanent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Slett
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (native) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              Ingen bilde
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to="/$kaupetCode"
            params={{ kaupetCode: row.kaupet_code }}
            className="line-clamp-2 text-sm font-medium leading-snug"
          >
            {row.title}
          </Link>
          <p className="mt-0.5 font-display text-sm">{formatPrice(row)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">{statusBadges}</div>
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {row.city && <span>{row.city}</span>}
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" /> {row.view_count}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" /> {row.favorite_count}
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={busy}
              onClick={() => void hapticImpact("light")}
            >
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link
                to="/mine-annonser/$id/rediger"
                params={{ id: row.id }}
                className="flex items-center gap-2"
              >
                <Pencil className="size-4" /> Rediger
              </Link>
            </DropdownMenuItem>
            {row.status === "active" && (
              <>
                {isDemo && !activePromotion && (
                  <DropdownMenuItem onClick={onPromote}>
                    <Sparkles className="size-4" /> Fremhev annonse
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    void hapticImpact("medium");
                    onMarkSold();
                  }}
                >
                  <CheckCircle2 className="size-4" /> Marker som solgt
                </DropdownMenuItem>
              </>
            )}
            {row.status === "expired" && (
              <DropdownMenuItem onClick={onRepublish}>
                <RotateCcw className="size-4" /> Publiser på nytt
              </DropdownMenuItem>
            )}
            {row.status === "draft" && (
              <DropdownMenuItem onClick={onPublishDraft}>
                <Send className="size-4" /> Publiser
              </DropdownMenuItem>
            )}
            {(row.status === "sold" || row.status === "archived") && (
              <DropdownMenuItem onClick={onReactivate}>
                <RotateCcw className="size-4" /> Reaktiver
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                void hapticImpact("medium");
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="size-4" /> Slett annonse
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {deleteDialog}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
        {imgUrl ? (
          <img src={imgUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            Ingen bilde
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/$kaupetCode"
            params={{ kaupetCode: row.kaupet_code }}
            className="truncate text-base font-medium hover:underline"
          >
            {row.title}
          </Link>
          {statusBadges}
        </div>
        <p className="mt-1 font-display text-sm">{formatPrice(row)}</p>
        <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {row.city && <span>{row.city}</span>}
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3" /> {row.view_count}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" /> {row.favorite_count}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/mine-annonser/$id/rediger" params={{ id: row.id }}>
          <Button size="sm" variant="outline" disabled={busy}>
            <Pencil className="size-4" /> Rediger
          </Button>
        </Link>
        {row.status === "active" ? (
          <>
            {isDemo &&
              (activePromotion ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                >
                  <Check className="size-4" /> Annonse fremhevet
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={onPromote} disabled={busy}>
                  <Sparkles className="size-4" /> Fremhev annonse
                </Button>
              ))}
            <Button size="sm" variant="outline" onClick={onMarkSold} disabled={busy}>
              <CheckCircle2 className="size-4" /> Marker som solgt
            </Button>
          </>
        ) : row.status === "expired" ? (
          <Button size="sm" variant="outline" onClick={onRepublish} disabled={busy}>
            <RotateCcw className="size-4" /> Publiser på nytt
          </Button>
        ) : row.status === "draft" ? (
          <Button size="sm" variant="outline" onClick={onPublishDraft} disabled={busy}>
            <Send className="size-4" /> Publiser
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onReactivate} disabled={busy}>
            <RotateCcw className="size-4" /> Reaktiver
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}>
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Slette annonsen?</AlertDialogTitle>
              <AlertDialogDescription>
                Dette kan ikke angres. Annonsen «{row.title}» blir fjernet permanent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Slett
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
