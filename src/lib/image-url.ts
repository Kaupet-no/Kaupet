// Klientvennlig URL-bygger for R2-lagrede bilder. Egen (ikke-`.server.ts`)
// fil fordi den må kunne importeres fra klientkode, i motsetning til resten
// av `r2.server.ts`.

/** Bygger den offentlige bilde-URL-en for en R2-nøkkel, uten dobbel eller
 * manglende skråstrek mellom base-URL og nøkkel.
 *
 * Leser base-URL-en på samme måte som `src/integrations/supabase/client.ts`:
 * `import.meta.env` for klientbygg (Vite bygger den inn), med `process.env`
 * som fallback for SSR. `VITE_R2_PUBLIC_BASE_URL` er publishable (bundles inn
 * i klienten) og derfor trygt å eksponere slik. */
export function publicImageUrl(key: string): string {
  const baseUrl = import.meta.env.VITE_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      'Miljøvariabelen "VITE_R2_PUBLIC_BASE_URL" (eller "R2_PUBLIC_BASE_URL" på serveren) mangler. Sett den i .env (se .env.example).',
    );
  }
  const base = baseUrl.replace(/\/+$/, "");
  const path = key.replace(/^\/+/, "");
  return `${base}/${path}`;
}
