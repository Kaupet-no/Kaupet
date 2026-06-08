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
        content: "Vi bruker kun nødvendige cookies. Ingen tredjepartssporing, ingen markedsføring.",
      },
    ],
  }),
  component: PersonvernPage,
});

function PersonvernPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Personvern</p>
        <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">Personvernerklæring</h1>
        <p className="mt-3 text-sm text-muted-foreground">Versjon 1.5 — sist oppdatert 6. juni 2026</p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Hos Kaupet.no lagrer vi kun det som er nødvendig for at tjenesten skal fungere. Vi bruker{" "}
            <strong>ingen tredjepartssporing</strong>, <strong>ingen markedsføringscookies</strong> og{" "}
            <strong>ingen eksterne analyseplattformer</strong>. Derfor benytter vi heller ikke en cookie-banner som ber
            om samtykke.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Hva lagres lokalt i nettleseren din</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Innloggingssesjon</strong> — nødvendig for at du skal kunne være logget inn mellom besøk. Lagres i
              nettleserens <code>localStorage</code> av vår autentiseringsleverandør Supabase.
            </li>
            <li>
              <strong>kaupet_read_&lt;id&gt;</strong> — et tidsstempel per samtale i <code>localStorage</code> som
              forteller når du sist åpnet chatten. Brukes kun til ulest-indikatoren i meldingsinnboksen.
            </li>
            <li>
              <strong>kaupet_visitor_id</strong> — en tilfeldig, anonym ID i <code>localStorage</code> som identifiserer
              nettleseren din uten å være knyttet til navn, e-post eller IP-adresse. Brukes utelukkende for å gi selger
              en grov teller på unike besøk per annonse, og for å hindre at samme besøkende telles flere ganger ved
              refresh eller gjenåpning. ID-en deles ikke med tredjepart og brukes ikke til sporing, profilering eller
              markedsføring.
            </li>

            <li>
              <strong>kaupet_push_msg_hint_dismissed_v1</strong> — lagres i <code>localStorage</code> og husker at du
              har lukket informasjonsmeldingen om push-varsler i meldingsoversikten, slik at den ikke vises på nytt.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Hva lagres på serveren</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Brukerprofil</strong>: navn, e-postadresse og eventuelt profilbilde, bio og lokasjon.
            </li>
            <li>
              <strong>Annonser</strong> du har lagt ut, med tilhørende bilder, beskrivelse, kategori og lokasjon
              (postnummer, by og koordinater for kartvisning).
            </li>
            <li>
              <strong>Meldinger</strong> mellom deg og andre brukere.
            </li>
            <li>
              <strong>Favoritter</strong> du har lagret.
            </li>
            <li>
              <strong>Vurderinger</strong> du gir eller mottar etter et salg (stjerner og eventuell kommentar). Disse
              er <strong>offentlig synlige</strong> på brukerprofilen.
            </li>
            <li>
              <strong>Lagrede søk</strong> med søkekriterier, og varsler om nye treff på disse søkene.
            </li>
            <li>
              <strong>Rapporter</strong> du sender inn om upassende annonser, lagres slik at moderator kan behandle dem.
            </li>
            <li>
              <strong>Blokkeringer</strong> — hvilke brukere eller samtaler du har blokkert. Dette er privat og kun
              synlig for deg.
            </li>
            <li>
              <strong>Bekreftede salg</strong> — når en selger markerer en annonse som solgt via en samtale, lagres
              koblingen mellom annonse, kjøper og selger. Denne er kun synlig for partene i salget.
            </li>
            <li>
              <strong>Anonyme visninger</strong> av annonser, for å gi selger statistikk. Disse knyttes til en
              sesjons-ID, ikke til personlige opplysninger.
            </li>
            <li>
              <strong>Push-varslinger</strong> — hvis du slår på varsler, lagrer vi et kryptografisk
              abonnementsnøkkelpar (offentlig/privat), nettleserinformasjon og dine preferanser for hva du vil
              varsles om (nye meldinger, lagrede søk).
            </li>
            <li>
              <strong>Moderering</strong> — ved brudd på reglene kan administrator registrere en{" "}
              <em>utestengelse</em>, <em>midlertidig suspensjon</em> eller <em>IP-blokkering</em>. Slike
              administrative handlinger logges internt med tidspunkt og årsak.
            </li>
            <li>
              <strong>Sletteforespørsler</strong> — når du ber om å slette kontoen, lagrer vi e-post og tidsstempel i
              den 7 dager lange angrefristen før permanent sletting utføres.
            </li>
          </ul>
          <p className="mt-4">
            Data lagres og behandles av <strong>Supabase</strong> på servere i EU. Supabase er vår databehandler. Du kan
            lese deres personvernerklæring her:{" "}
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
          <h2 className="font-display text-2xl">Push-varslinger</h2>
          <p className="mt-3">
            Push-varslinger er <strong>frivillige og krever eksplisitt samtykke</strong>. Du aktiverer dem selv i
            nettleseren eller appen. Vi lagrer kun det som er nødvendig for å sende varsler:
          </p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Abonnementsnøkler</strong> — et kryptografisk nøkkelpar generert av nettleseren din. Vi kan ikke
              bruke disse til å spore deg på tvers av nettsteder.
            </li>
            <li>
              <strong>Enhets- og nettleserinformasjon</strong> — brukes til å sende varslet til riktig enhet.
            </li>
            <li>
              <strong>Varselformål</strong> — hvilke hendelser du vil varsles om (for eksempel nye meldinger eller treff
              på lagrede søk).
            </li>
          </ul>
          <p className="mt-4">
            Du kan når som helst <strong>skru av varsler</strong> i nettleserens innstillinger eller i profilen din på
            Kaupet.no. Da slettes abonnementsdataene automatisk fra serveren.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Juridisk grunnlag</h2>
          <p className="mt-3">
            Behandlingen skjer på grunnlag av <strong>avtale</strong> (nødvendig for å levere tjenesten du har bedt om),{" "}
            <strong>samtykke</strong> (push-varslinger og eventuelle preferanser) og{" "}
            <strong>berettiget interesse</strong> (statistikk til selgere og sikkerhet i tjenesten).
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Dine rettigheter</h2>
          <p className="mt-3">
            Du har rett til innsyn, retting, sletting og dataportabilitet for opplysningene vi har om deg. Du kan også
            trekke tilbake samtykke og klage til Datatilsynet. Kontakt oss for å utøve rettighetene dine.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Sletting av brukerkonto</h2>
          <p className="mt-3">
            Du kan slette kontoen din når som helst fra <strong>Profil → Kontoinnstillinger</strong>. Av
            sikkerhetshensyn settes kontoen først som <em>inaktiv</em> i 7 dager. I denne perioden kan du logge inn
            igjen for å angre slettingen. Etter 7 dager fjernes kontoen permanent fra systemet.
          </p>
          <p className="mt-3">
            For å bevare samtalehistorikken for andre brukere blir profilen din <strong>anonymisert</strong> ved
            permanent sletting: navn, profilbilde, bio og lokasjon fjernes, og du vises som "Slettet bruker" i tidligere
            meldinger. Annonsene dine slettes. E-postadresse og innloggingsdata fjernes fullstendig.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Tredjeparter</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Supabase</strong> — databehandler for autentisering, database og fillagring. Servere i EU.
            </li>
            <li>
              <strong>Google Fonts</strong> — skrifttyper lastes direkte fra Googles servere. IP-adressen din blir
              synlig for Google ved henting av skrifttypene.
            </li>
            <li>
              <strong>OpenStreetMap / CARTO</strong> — kartfliser og adressesøk (Nominatim) for visning og geokoding av
              lokasjon på annonser. IP-adressen din blir synlig for disse tjenestene når kart eller adressesøk brukes.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Endringer</h2>
          <p className="mt-3">
            Vi oppdaterer denne erklæringen ved endringer i tjenesten. Versjon og dato øverst på siden viser når den
            sist ble endret.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Behandlingsansvarlig</h2>
          <p className="mt-3">
            Kaupet.no forvaltes av <strong>Happy Pixel AS</strong>, organisasjonsnummer{" "}
            <strong>933 197 867</strong>. Happy Pixel AS er behandlingsansvarlig for
            personopplysninger som samles inn gjennom tjenesten. Henvendelser om personvern kan
            sendes til kontaktadressen oppgitt nedenfor.
          </p>
          <p className="mt-3">
            <strong>E-post:</strong>{" "}
            <a
              href="mailto:kontakt@kaupet.no"
              className="text-primary underline underline-offset-2"
            >
              kontakt@kaupet.no
            </a>
          </p>
        </section>

        <div className="pt-4">
          <Link to="/" className="text-sm text-primary underline underline-offset-2">
            Tilbake til forsiden
          </Link>
        </div>
      </div>
    </article>
  );
}
