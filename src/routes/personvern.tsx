import { createFileRoute, Link } from "@tanstack/react-router";

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
        content:
          "Vi bruker kun nødvendige cookies. Ingen tredjepartssporing, ingen markedsføring.",
      },
    ],
  }),
  component: PersonvernPage,
});

function PersonvernPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Personvern
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
          Personvernerklæring
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Versjon 1.1 — sist oppdatert 4. juni 2026
        </p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Hos Kaupet.no lagrer vi kun det som er nødvendig for at tjenesten
            skal fungere. Vi bruker <strong>ingen tredjepartssporing</strong>,{" "}
            <strong>ingen markedsføringscookies</strong> og{" "}
            <strong>ingen analyseplattformer</strong>. Derfor trenger vi heller
            ikke en cookie-banner som ber om samtykke — standardvalget for alle
            brukere er "kun nødvendige cookies".
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Hva lagres lokalt i nettleseren din</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Innloggingssesjon</strong> — nødvendig for at du skal kunne
              være logget inn mellom besøk. Lagres i nettleserens{" "}
              <code>localStorage</code> av vår autentiseringsleverandør.
            </li>
            <li>
              <strong>kaupet_read_&lt;id&gt;</strong> — et tidsstempel per samtale
              som forteller når du sist åpnet chatten. Brukes kun til
              uleste-indikatoren i meldingsinnboksen.
            </li>
            <li>
              <strong>kaupet_viewed_&lt;id&gt;</strong> — en markering per
              nettleserfane som hindrer at samme annonse telles flere ganger ved
              refresh. Slettes når fanen lukkes.
            </li>
            <li>
              <strong>kaupet_session_id</strong> — en anonym ID som lever kun i
              én nettleser-økt. Brukes til å gi selger en grov teller på unike
              besøk per annonse. Slettes når du lukker fanen.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Hva lagres på serveren</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Brukerprofil</strong>: navn, e-postadresse og eventuelt
              profilbilde.
            </li>
            <li>
              <strong>Annonser</strong> du har lagt ut, med tilhørende bilder,
              beskrivelse og lokasjon.
            </li>
            <li>
              <strong>Meldinger</strong> mellom deg og andre brukere.
            </li>
            <li>
              <strong>Favoritter</strong> du har lagret.
            </li>
            <li>
              <strong>Anonyme visninger</strong> av annonser, for å gi selger
              statistikk. Disse knyttes til en sesjons-ID, ikke til personlige
              opplysninger.
            </li>
          </ul>
          <p className="mt-4">
            Data lagres og behandles av <strong>Supabase</strong> på servere i
            EU. Supabase er vår databehandler. Du kan lese deres
            personvernerklæring her:{" "}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              supabase.com/privacy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Juridisk grunnlag</h2>
          <p className="mt-3">
            Behandlingen skjer på grunnlag av <strong>avtale</strong> (nødvendig
            for å levere tjenesten du har bedt om) og{" "}
            <strong>berettiget interesse</strong> (statistikk til selgere og
            sikkerhet i tjenesten).
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Dine rettigheter</h2>
          <p className="mt-3">
            Du har rett til innsyn, retting, sletting og dataportabilitet for
            opplysningene vi har om deg. Du kan også trekke tilbake samtykke og
            klage til Datatilsynet. Kontakt oss for å utøve rettighetene dine.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Tredjeparter</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Supabase</strong> — databehandler for autentisering,
              database og fillagring. Servere i EU.
            </li>
            <li>
              <strong>Google Fonts</strong> — skrifttyper lastes direkte fra
              Googles servere. IP-adressen din blir synlig for Google ved
              henting av skrifttypene.
            </li>
            <li>
              <strong>CartoDB</strong> — kartfliser for visning av lokasjon på
              annonser.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Endringer</h2>
          <p className="mt-3">
            Vi oppdaterer denne erklæringen ved endringer i tjenesten. Versjon
            og dato øverst på siden viser når den sist ble endret.
          </p>
        </section>

        <div className="pt-4">
          <Link
            to="/"
            className="text-sm text-primary underline underline-offset-2"
          >
            Tilbake til forsiden
          </Link>
        </div>
      </div>
    </article>
  );
}
