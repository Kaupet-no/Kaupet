import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Ban,
  ChevronRight,
  Flag,
  FolderPlus,
  Receipt,
  Sparkles,
  UserX,
  type LucideIcon,
} from "lucide-react";

import type { Tables } from "@/integrations/supabase/types";

export type AdminEvent = Tables<"admin_events">;

export type AdminEventKind =
  | "category_suggestion"
  | "organization_registered"
  | "proff_trial_started"
  | "proff_cancelled"
  | "proff_ordered"
  | "proff_invoice_due"
  | "proff_payment_overdue"
  | "listing_reported"
  | "user_reported";

// Hvor hendelsen håndteres. Holdes i sync med CHECK på admin_events.kind.
export const EVENT_KINDS: Record<AdminEventKind, { label: string; icon: LucideIcon; to: string }> =
  {
    listing_reported: { label: "Rapportert annonse", icon: Flag, to: "/admin/moderasjon" },
    user_reported: { label: "Rapportert bruker", icon: UserX, to: "/admin/moderasjon" },
    organization_registered: { label: "Ny bedrift", icon: BadgeCheck, to: "/admin/bedrifter" },
    proff_trial_started: {
      label: "Prøveperiode startet",
      icon: Sparkles,
      to: "/admin/proff-abonnement",
    },
    proff_cancelled: { label: "Prøveperiode avsluttet", icon: Ban, to: "/admin/proff-abonnement" },
    proff_ordered: { label: "Proff bestilt", icon: Receipt, to: "/admin/proff-abonnement" },
    proff_invoice_due: {
      label: "Faktura skal sendes",
      icon: CalendarClock,
      to: "/admin/proff-abonnement",
    },
    proff_payment_overdue: {
      label: "Faktura forfalt",
      icon: AlertTriangle,
      to: "/admin/proff-abonnement",
    },
    category_suggestion: {
      label: "Kategoriforslag",
      icon: FolderPlus,
      to: "/admin/tilbakemeldinger",
    },
  };

export function eventMeta(kind: string) {
  return EVENT_KINDS[kind as AdminEventKind] ?? EVENT_KINDS.listing_reported;
}

export function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: nb });
}

/** Rad i konsollstil (som ConsoleLink i bedriftskonsollet), men som lenke. */
export function EventLinkRow({ event }: { event: AdminEvent }) {
  const meta = eventMeta(event.kind);
  return (
    <Link
      to={meta.to}
      className="group flex min-h-16 w-full items-center gap-4 border-b border-border p-4 text-left transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <meta.icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{event.title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {meta.label} · {timeAgo(event.created_at)}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
    </Link>
  );
}
