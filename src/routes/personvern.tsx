import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonvernContent } from "@/components/legal/personvern-content";
import { NativePageHeader } from "@/components/native-page-header";
import { useIsNative } from "@/hooks/use-is-native";

export const Route = createFileRoute("/personvern")({
  head: () => ({
    meta: [
      { title: "Personvernerklæring — Kaupet.no" },
      {
        name: "description",
        content:
          "Slik behandler Kaupet.no personopplysninger. Vi lagrer kun det som er nødvendig for at tjenesten skal fungere, og bruker ingen sporing eller markedsføringscookies.",
      },
      { property: "og:title", content: "Personvernerklæring — Kaupet.no" },
      {
        property: "og:description",
        content: "Vi bruker kun nødvendige cookies. Ingen tredjepartssporing, ingen markedsføring.",
      },
    ],
  }),
  component: PersonvernPage,
});

function PersonvernPage() {
  const native = useIsNative();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <NativePageHeader title="Personvern" />
      {!native && (
        <header className="mb-10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Personvern</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
            Personvernerklæring
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">Sist oppdatert 25. september 2026</p>
        </header>
      )}

      <PersonvernContent />
      <div className="mt-10 pt-4">
        <Link to="/" className="text-sm text-primary underline underline-offset-2">
          Tilbake til forsiden
        </Link>
      </div>
    </article>
  );
}
