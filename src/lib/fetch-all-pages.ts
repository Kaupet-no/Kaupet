export const PAGE_SIZE = 1000;

/** PostgREST kapper hvert svar ved prosjektets max-rows (1000) uten feil, også
 * med en høyere `.limit()`. Henter side for side med `.range()` til en side
 * kommer kort tilbake. `page` må sortere stabilt på en unik nøkkel, ellers kan
 * rader hoppes over eller gjentas mellom sidene. Returnerer samme form som en
 * enkelt Supabase-spørring, så kallstedets feilhåndtering kan beholdes. */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: null } | { data: null; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/** Hvor mange ID-er ett `.in(...)`-filter får: tusenvis av UUID-er i
 * query-strengen gir en URL som avvises (414). */
export const ID_CHUNK_SIZE = 100;

/** `fetchAllPages` for et `.in(...)`-filter over mange ID-er: ID-ene deles i
 * biter, og hver bit pagineres for seg. Rader for samme ID havner i samme bit,
 * så sorteringen per ID beholdes. */
export async function fetchAllPagesByIds<T>(
  ids: string[],
  page: (
    chunk: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: null } | { data: null; error: unknown }> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + ID_CHUNK_SIZE);
    const result = await fetchAllPages<T>((from, to) => page(chunk, from, to));
    if (result.data === null) return result;
    rows.push(...result.data);
  }
  return { data: rows, error: null };
}
