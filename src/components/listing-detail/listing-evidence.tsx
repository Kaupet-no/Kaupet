import type { ListingFactSource } from "./fact-source";

const SOURCE_TEXT = {
  registry: "Kjøretøydata fra Statens vegvesen",
  seller: "Opplysninger gitt av selger",
  kaupet: "Kontoopplysninger fra Kaupet",
  unknown: "Kilden til opplysningen er ukjent",
} as const;

export function ListingEvidence({ sources }: { sources: ListingFactSource[] }) {
  return (
    <section
      aria-labelledby="listing-evidence-heading"
      className="mt-4 border-t border-border pt-4"
    >
      <h2 id="listing-evidence-heading" className="text-sm font-medium">
        Faktagrunnlag
      </h2>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        {sources.map(({ source, timestamp }) => (
          <li key={source}>
            <span>{SOURCE_TEXT[source]}</span>
            {timestamp && (
              <>
                {" · "}
                <time dateTime={timestamp}>
                  Registrert{" "}
                  {new Date(timestamp).toLocaleDateString("nb-NO", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SellerNoKnownIssues() {
  return (
    <div
      role="note"
      aria-label="Selgeropplysning"
      className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
    >
      <p className="text-xs font-medium text-muted-foreground">Oppgitt av selger</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground/90">
        Selger har oppgitt at kjøretøyet ikke har kjente feil eller mangler.
      </p>
    </div>
  );
}
