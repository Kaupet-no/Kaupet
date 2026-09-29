import type { QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  deleteNotification,
  deletePriceDrop,
  listNotifications,
  listPriceDrops,
  markAllNotificationsRead as markAllSavedSearchNotificationsRead,
  markAllPriceDropsRead,
  markNotificationRead,
  markPriceDropRead,
  type PriceDropNotification,
  type SavedSearchNotification,
} from "@/lib/saved-searches";
import {
  deleteWtbMatchNotification,
  listWtbMatchNotifications,
  markAllWtbMatchNotificationsRead,
  markWtbMatchNotificationRead,
  type WtbMatchNotification,
} from "@/lib/wtb-listings.functions";

type SearchItem = SavedSearchNotification & {
  kind: "search";
  listing_title: string | null;
  listing_code: string | null;
  search_name: string | null;
};
type PriceDropItem = PriceDropNotification & {
  kind: "price_drop";
  listing_title: string | null;
  listing_code: string | null;
};
type WtbMatchItem = WtbMatchNotification & {
  kind: "wtb_match";
  listing_title: string | null;
  listing_code: string | null;
  wtb_title: string | null;
};
export type NotificationItem = SearchItem | PriceDropItem | WtbMatchItem;

export const notificationHistoryQueryKey = (userId?: string, pageSize?: number) =>
  pageSize === undefined
    ? (["notifications", userId, "history"] as const)
    : (["notifications", userId, "history", pageSize] as const);

export async function listEnrichedNotifications(limit = 30, offset = 0) {
  const [notifs, drops, wtbMatches] = await Promise.all([
    listNotifications(limit, offset),
    listPriceDrops(limit, offset),
    listWtbMatchNotifications(limit, offset),
  ]);
  const listingIds = Array.from(
    new Set([
      ...notifs.map((n) => n.listing_id),
      ...drops.map((d) => d.listing_id),
      ...wtbMatches.map((m) => m.listing_id),
    ]),
  );
  const searchIds = Array.from(new Set(notifs.map((n) => n.saved_search_id)));
  const wtbListingIds = Array.from(new Set(wtbMatches.map((m) => m.wtb_listing_id)));
  const [listingsRes, searchesRes, wtbListingsRes] = await Promise.all([
    listingIds.length
      ? supabase.from("listings").select("id, title, kaupet_code").in("id", listingIds)
      : Promise.resolve({ data: [] as { id: string; title: string; kaupet_code: string }[] }),
    searchIds.length
      ? supabase.from("saved_searches").select("id, name").in("id", searchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    wtbListingIds.length
      ? supabase.from("wtb_listings").select("id, title").in("id", wtbListingIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const listingMap = new Map((listingsRes.data ?? []).map((l) => [l.id, l]));
  const searchMap = new Map((searchesRes.data ?? []).map((s) => [s.id, s.name]));
  const wtbListingMap = new Map((wtbListingsRes.data ?? []).map((w) => [w.id, w.title]));

  const items: NotificationItem[] = [
    ...notifs.map((n): SearchItem => ({
      ...n,
      kind: "search",
      listing_title: listingMap.get(n.listing_id)?.title ?? null,
      listing_code: listingMap.get(n.listing_id)?.kaupet_code ?? null,
      search_name: searchMap.get(n.saved_search_id) ?? null,
    })),
    ...drops.map((d): PriceDropItem => ({
      ...d,
      kind: "price_drop",
      listing_title: listingMap.get(d.listing_id)?.title ?? null,
      listing_code: listingMap.get(d.listing_id)?.kaupet_code ?? null,
    })),
    ...wtbMatches.map((m): WtbMatchItem => ({
      ...m,
      kind: "wtb_match",
      listing_title: listingMap.get(m.listing_id)?.title ?? null,
      listing_code: listingMap.get(m.listing_id)?.kaupet_code ?? null,
      wtb_title: wtbListingMap.get(m.wtb_listing_id) ?? null,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    items,
    hasMore: notifs.length === limit || drops.length === limit || wtbMatches.length === limit,
  };
}

export async function markAllNotificationsRead() {
  await Promise.all([
    markAllSavedSearchNotificationsRead(),
    markAllPriceDropsRead(),
    markAllWtbMatchNotificationsRead(),
  ]);
}

export async function markNotificationItemRead(item: NotificationItem) {
  if (item.kind === "search") await markNotificationRead(item.id);
  else if (item.kind === "price_drop") await markPriceDropRead(item.id);
  else await markWtbMatchNotificationRead(item.id);
}

export async function deleteNotificationItem(item: NotificationItem) {
  if (item.kind === "search") await deleteNotification(item.id);
  else if (item.kind === "price_drop") await deletePriceDrop(item.id);
  else await deleteWtbMatchNotification(item.id);
}

export function invalidateNotificationQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
  void queryClient.invalidateQueries({ queryKey: ["saved-search-unread-counts"] });
}
