import { supabase } from "@/integrations/supabase/client";

export type SearchCriteria = {
  q?: string;
  terms?: string[];
  qMode?: "all" | "any";
  categories?: string[];
  catMode?: "all" | "any";
  conditions?: string[];
  min?: number | null;
  max?: number | null;
  includeFree?: boolean;
  sort?: "new" | "price_asc" | "price_desc";
  lat?: number | null;
  lng?: number | null;
  radius?: number | null;
  loc?: string;
};

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  criteria: SearchCriteria;
  notify: boolean;
  created_at: string;
  updated_at: string;
};

export type SavedSearchNotification = {
  id: string;
  saved_search_id: string;
  listing_id: string;
  read_at: string | null;
  created_at: string;
};

export function summarizeCriteria(c: SearchCriteria): string {
  const parts: string[] = [];
  const terms = c.terms?.length ? c.terms : c.q ? c.q.split(/\s+/).filter(Boolean) : [];
  if (terms.length) parts.push(`"${terms.join(" ")}"`);
  if (c.categories?.length)
    parts.push(`${c.categories.length} kategori${c.categories.length === 1 ? "" : "er"}`);
  if (c.conditions?.length)
    parts.push(`${c.conditions.length} tilstand${c.conditions.length === 1 ? "" : "er"}`);
  if (c.min != null || c.max != null) {
    const min = c.min != null ? `${c.min} kr` : "0 kr";
    const max = c.max != null ? `${c.max} kr` : "∞";
    parts.push(`${min}–${max}`);
  }
  if (c.loc) parts.push(`${c.loc}${c.radius ? ` (${c.radius} km)` : ""}`);
  return parts.length ? parts.join(" · ") : "Alle annonser";
}

export async function listSavedSearches() {
  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedSearch[];
}

export async function createSavedSearch(name: string, criteria: SearchCriteria, notify = true) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Du må være logget inn");
  const { data, error } = await supabase
    .from("saved_searches")
    .insert({ name, criteria, notify, user_id: u.user.id })
    .select()
    .single();
  if (error) throw error;
  return data as SavedSearch;
}

export async function updateSavedSearch(
  id: string,
  patch: Partial<Pick<SavedSearch, "name" | "criteria" | "notify">>,
) {
  const { error } = await supabase.from("saved_searches").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSavedSearch(id: string) {
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  if (error) throw error;
}

export async function listNotifications(limit = 30) {
  const { data, error } = await supabase
    .from("saved_search_notifications")
    .select("id, saved_search_id, listing_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SavedSearchNotification[];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("saved_search_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from("saved_search_notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("saved_search_notifications").delete().eq("id", id);
  if (error) throw error;
}

export type PriceDropNotification = {
  id: string;
  listing_id: string;
  old_price_nok: number;
  new_price_nok: number;
  drop_pct: number;
  read_at: string | null;
  created_at: string;
};

export async function listPriceDrops(limit = 30) {
  const { data, error } = await supabase
    .from("favorite_price_drops")
    .select("id, listing_id, old_price_nok, new_price_nok, drop_pct, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PriceDropNotification[];
}

export async function markPriceDropRead(id: string) {
  const { error } = await supabase
    .from("favorite_price_drops")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllPriceDropsRead() {
  const { error } = await supabase
    .from("favorite_price_drops")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}

export async function deletePriceDrop(id: string) {
  const { error } = await supabase.from("favorite_price_drops").delete().eq("id", id);
  if (error) throw error;
}
