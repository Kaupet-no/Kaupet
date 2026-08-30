import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Pencil,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Eye,
  Heart,
  Clock,
  Check,
  Send,
  MoreVertical,
} from "lucide-react";

import { signListingImageUrls } from "@/lib/storage";
import { useIsNative } from "@/hooks/use-is-native";
import { hapticImpact } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Vehicle360CaptureLauncher } from "@/components/vehicle-360-capture-launcher";
import { Badge } from "@/components/ui/badge";
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
import { formatPrice } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

export type Row = {
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

function RowImage({ imgUrl, hasCoverPath }: { imgUrl: string | null; hasCoverPath: boolean }) {
  if (imgUrl) {
    return <img src={imgUrl} alt="" className="size-full object-cover" />;
  }
  if (hasCoverPath) {
    return <Skeleton className="size-full rounded-none" />;
  }
  return (
    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
      Ingen bilde
    </div>
  );
}

function daysLeft(expires_at: string | null): number | null {
  if (!expires_at) return null;
  const ms = new Date(expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function ListingRow({
  row,
  isVehicle,
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
  /** Whether the listing's category is under Bil og MC — gates the native-only
   * "legg til 360°-opptak"-action (draft/active rows only). */
  isVehicle: boolean;
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
      {activePromotion && (
        <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs text-brand-text">
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
        <div
          className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted"
          style={{ width: "5rem", height: "5rem" }}
        >
          <RowImage imgUrl={imgUrl} hasCoverPath={!!row.cover_path} />
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
        {isVehicle && (row.status === "draft" || row.status === "active") && (
          <Vehicle360CaptureLauncher
            listingId={row.id}
            listingTitle={row.title}
            label="Legg til 360°-opptak"
            variant="ghost"
            size="icon"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={busy}
              onClick={() => void hapticImpact("light")}
              aria-label="Flere valg"
            >
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link
                to="/$kaupetCode"
                params={{ kaupetCode: row.kaupet_code }}
                search={{ edit: true }}
                className="flex items-center gap-2"
              >
                <Pencil className="size-4" /> Rediger
              </Link>
            </DropdownMenuItem>
            {row.status === "active" && (
              <>
                {!activePromotion && (
                  <DropdownMenuItem onClick={onPromote}>Fremhev annonse</DropdownMenuItem>
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
      <div
        className="size-24 shrink-0 overflow-hidden rounded-lg bg-muted"
        style={{ width: "6rem", height: "6rem" }}
      >
        <RowImage imgUrl={imgUrl} hasCoverPath={!!row.cover_path} />
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
        <Link to="/$kaupetCode" params={{ kaupetCode: row.kaupet_code }} search={{ edit: true }}>
          <Button size="sm" variant="outline" disabled={busy}>
            <Pencil className="size-4" /> Rediger
          </Button>
        </Link>
        {row.status === "active" ? (
          <>
            {activePromotion ? (
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
                Fremhev annonse
              </Button>
            )}
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
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              aria-label="Slett"
            >
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
