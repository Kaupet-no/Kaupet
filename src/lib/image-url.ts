// Klientvennlig URL-bygger for R2-lagrede bilder. Egen (ikke-`.server.ts`)
// fil fordi den må kunne importeres fra klientkode, i motsetning til resten
// av `r2.server.ts`.

/** Leser R2-bildebasen slik `src/integrations/supabase/client.ts` gjør:
 * `import.meta.env` for klientbygg (Vite bygger den inn), med `process.env`
 * som fallback for SSR. `VITE_R2_PUBLIC_BASE_URL` er publishable (bundles inn
 * i klienten) og derfor trygt å eksponere slik. Delt av `publicImageUrl` og
 * `pathFromPublicImageUrl` slik at begge er enige om hvilken base som gjelder
 * — leser man kun `process.env` på serveren, blir en base satt via
 * `VITE_R2_PUBLIC_BASE_URL` usynlig der. */
function readBaseUrl(): string | undefined {
  return import.meta.env.VITE_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL;
}

/** Bygger den offentlige bilde-URL-en for en R2-nøkkel, uten dobbel eller
 * manglende skråstrek mellom base-URL og nøkkel. */
export function publicImageUrl(key: string): string {
  const baseUrl = readBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Miljøvariabelen "VITE_R2_PUBLIC_BASE_URL" (eller "R2_PUBLIC_BASE_URL" på serveren) mangler. Sett den i .env (se .env.example).',
    );
  }
  const base = baseUrl.replace(/\/+$/, "");
  const path = key.replace(/^\/+/, "");
  return `${base}/${path}`;
}

/** Sti fra en offentlig R2-URL, eller `null` hvis base-URL-en mangler eller
 * URL-en ikke peker inn i den konfigurerte bildebasen (f.eks. en URL fra en
 * tidligere migrering, eller forsøk på å referere en annen bucket). */
export function pathFromPublicImageUrl(url: string): string | null {
  const base = (readBaseUrl() ?? "").replace(/\/+$/, "");
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}
