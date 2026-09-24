// Minimal, lokal ambient typedeklarasjon for `cloudflare:workers`, brukt av
// `image-compression.server.ts` for å hente Cloudflare Images-bindingen
// (`env.IMAGES`) — se wrangler.jsonc for selve bindingskonfigurasjonen.
//
// Modulen finnes kun i selve Cloudflare Workers-runtimet, og repoet unngår
// bevisst å dra inn `@cloudflare/workers-types` som avhengighet for dette
// ene grensesnittet (se planens fase 3: "ikke legg til tunge avhengigheter").
// Dette må ligge i en egen .d.ts-fil UTEN egne top-level imports/exports —
// en vanlig .ts-fil med imports/exports er en "modul", og TypeScripts
// "Bundler"-modulopplegg tolker da `declare module "ukjent-spesifikator"`
// inni den som en augmentation av en allerede eksisterende modul (feil
// TS2664), ikke som en ny ambient modul.
declare module "cloudflare:workers" {
  type CloudflareImageOutputResult = { response(): Response };
  type CloudflareImageTransformHandle = {
    output(opts: { format: string; quality: number }): Promise<CloudflareImageOutputResult>;
  };
  type CloudflareImagesBinding = {
    input(stream: ReadableStream): {
      transform(opts: {
        width: number;
        height: number;
        fit: "scale-down";
      }): CloudflareImageTransformHandle;
    };
  };

  export const env: { IMAGES?: CloudflareImagesBinding };
}
