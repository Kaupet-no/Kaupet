import { createFileRoute } from "@tanstack/react-router";
import { VilkarContent } from "@/components/legal/vilkar-content";
import { NativePageHeader } from "@/components/native-page-header";
import { useIsNative } from "@/hooks/use-is-native";

export const Route = createFileRoute("/vilkar")({
  head: () => ({
    meta: [
      { title: "Brukervilkår — Kaupet.no" },
      {
        name: "description",
        content:
          "Reglene for bruk av Kaupet.no som privatperson. Hva du kan og ikke kan gjøre på markedsplassen, og hvilke rettigheter og plikter du har som bruker.",
      },
      { property: "og:title", content: "Brukervilkår — Kaupet.no" },
      {
        property: "og:description",
        content: "Reglene for bruk av Kaupet.no — rettigheter, plikter og akseptabel bruk.",
      },
    ],
  }),
  component: VilkarPage,
});

function VilkarPage() {
  const native = useIsNative();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <NativePageHeader title="Vilkår" />
      {!native && (
        <header className="mb-10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Brukervilkår</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
            Brukervilkår for privatpersoner
          </h1>
        </header>
      )}

      <VilkarContent />
    </article>
  );
}
