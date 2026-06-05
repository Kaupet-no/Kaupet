import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Trash2, CheckCircle2, RotateCcw, Plus, Eye, Heart, Clock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { signListingImageUrls } from "@/lib/storage";
import { republishListing } from "@/lib/listings.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  title: string;
  status: "draft" | "active" | "sold" | "archived" | "expired";
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  view_count: number;
  created_at: string;
  expires_at: string | null;
  cover_path: string | null;
};

function formatPrice(r: Row) {
  if (r.is_free) return "Gis bort";
  if (r.price_nok == null) return "Pris ved henvendelse";
  return `${r.price_nok.toLocaleString("nb-NO")} kr`;
}

function daysLeft(expires_at: string | null): number | null {
  if (!expires_at) return null;
  const ms = new Date(expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

const STATUS_LABEL: Record<Row["status"], string> = {
  draft: "Utkast",
  active: "Aktiv",
  sold: "Solgt",
  archived: "Arkivert",
  expired: "Utløpt",
};

function MyListingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "active" | "sold" | "draft">("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["my-listings"],
    queryFn: async (): Promise<Row[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [];
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, title, status, price_nok, is_free, city, view_count, created_at, expires_at, listing_images(storage_path, sort_order)",
        )
        .eq("seller_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l) => {
        const cover = (l.listing_images ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path ?? null;
        return {
          id: l.id,
          title: l.title,
          status: l.status as Row["status"],
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          view_count: l.view_count,
          created_at: l.created_at,
          expires_at: l.expires_at,
          cover_path: cover,
        };
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Row["status"] }) => {
      const { error } = await supabase
        .from("listings")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Status oppdatert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteListing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Annonsen er slettet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRepublish = useServerFn(republishListing);
  const republish = useMutation({
    mutationFn: async (id: string) => {
      return doRepublish({ data: { id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Annonsen er publisert på nytt i 30 nye dager");
    },
    onError: (e: Error) => toast.error(e.message),
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
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Mine annonser</h1>
          <p className="mt-1 text-muted-foreground">
            Rediger, marker som solgt, eller slett annonsene dine.
          </p>
        </div>
        <Link to="/ny-annonse">
          <Button>
            <Plus className="size-4" /> Ny annonse
          </Button>
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-6">
        <TabsList>
          <TabsTrigger value="all">Alle ({rows?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="active">Aktive</TabsTrigger>
          <TabsTrigger value="sold">Solgt / utløpt</TabsTrigger>
          <TabsTrigger value="draft">Utkast</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Laster annonser…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Ingen annonser å vise her.
              </p>
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
                  onMarkSold={() => updateStatus.mutate({ id: r.id, status: "sold" })}
                  onReactivate={() => updateStatus.mutate({ id: r.id, status: "active" })}
                  onRepublish={() => republish.mutate(r.id)}
                  onDelete={() => deleteListing.mutate(r.id)}
                  busy={updateStatus.isPending || deleteListing.isPending || republish.isPending}
                />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ListingRow({
  row,
  onMarkSold,
  onReactivate,
  onRepublish,
  onDelete,
  busy,
}: {
  row: Row;
  onMarkSold: () => void;
  onReactivate: () => void;
  onRepublish: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
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
            to="/annonse/$id"
            params={{ id: row.id }}
            className="truncate text-base font-medium hover:underline"
          >
            {row.title}
          </Link>
          <Badge
            variant={row.status === "active" ? "default" : "secondary"}
            className="text-xs"
          >
            {STATUS_LABEL[row.status]}
          </Badge>
          {row.status === "active" && (() => {
            const d = daysLeft(row.expires_at);
            if (d == null) return null;
            const tone =
              d <= 2
                ? "border-destructive/40 text-destructive"
                : d <= 7
                  ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                  : "border-border text-muted-foreground";
            return (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tone}`}
              >
                <Clock className="size-3" />
                {d === 0 ? "Utløper i dag" : `${d} ${d === 1 ? "dag" : "dager"} igjen`}
              </span>
            );
          })()}
          {row.status === "expired" && (
            <span className="text-xs text-muted-foreground">
              Publiser på nytt for 30 nye dager
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-sm">{formatPrice(row)}</p>
        <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {row.city && <span>{row.city}</span>}
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3" /> {row.view_count}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/mine-annonser/$id/rediger"
          params={{ id: row.id }}
        >
          <Button size="sm" variant="outline" disabled={busy}>
            <Pencil className="size-4" /> Rediger
          </Button>
        </Link>
        {row.status === "active" ? (
          <Button size="sm" variant="outline" onClick={onMarkSold} disabled={busy}>
            <CheckCircle2 className="size-4" /> Marker som solgt
          </Button>
        ) : row.status === "expired" ? (
          <Button size="sm" variant="outline" onClick={onRepublish} disabled={busy}>
            <RotateCcw className="size-4" /> Publiser på nytt
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
