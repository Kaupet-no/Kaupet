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
          Versjon 1.2 — sist oppdatert 5. juni 2026
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
          <h2 className="font-display text-2xl">Informasjonskapsler (cookies)</h2>
          <p className="mt-3">
            Vi benytter kun én HTTP-informasjonskapsel. I tillegg lagres noen
            nødvendige data i nettleserens <code>localStorage</code> og{" "}
            <code>sessionStorage</code>.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 pr-4 font-semibold">Navn</th>
                  <th className="pb-2 pr-4 font-semibold">Type</th>
                  <th className="pb-2 pr-4 font-semibold">Varighet</th>
                  <th className="pb-2 font-semibold">Formål</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">sidebar_state</td>
                  <td className="py-2 pr-4">HTTP-cookie</td>
                  <td className="py-2 pr-4">7 dager</td>
                  <td className="py-2">
                    Husker om sidepanelet er utvidet eller minimert på
                    dataskjermer.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">
                    sb-{'{prosjekt}'}-auth-token
                  </td>
                  <td className="py-2 pr-4">localStorage</td>
                  <td className="py-2 pr-4">Til utlogging</td>
                  <td className="py-2">
                    Nødvendig for innloggingssesjonen. Settes av vår
                    autentiseringsleverandør.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">
                    kaupet_read_&lt;id&gt;
                  </td>
                  <td className="py-2 pr-4">localStorage</td>
                  <td className="py-2 pr-4">Ved sletting</td>
                  <td className="py-2">
                    Tidsstempel per samtale som forteller når du sist åpnet
                    chatten. Brukes kun til uleste-indikatoren i
                    meldingsinnboksen.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">
                    kaupet_viewed_&lt;id&gt;
                  </td>
                  <td className="py-2 pr-4">sessionStorage</td>
                  <td className="py-2 pr-4">Fanen lukkes</td>
                  <td className="py-2">
                    Hindrer at samme annonse telles flere ganger ved
                    oppdatering av siden i samme fane.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">
                    kaupet_session_id
                  </td>
                  <td className="py-2 pr-4">sessionStorage</td>
                  <td className="py-2 pr-4">Fanen lukkes</td>
                  <td className="py-2">
                    Anonym sesjons-ID som brukes til å telle unike besøk per
                    annonse for selgerens statistikk. Kan ikke knyttes til
                    personlige opplysninger.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-muted-foreground">
            <strong>Push-varsler (valgfritt):</strong> Hvis du aktiverer
            nettleservarsler, registrerer vi en service worker og lagrer et
            kryptografisk abonnement (endepunkt, p256dh-nøkkel og auth-token)
            på serveren. Dette er nødvendig for å kunne sende deg varsler om
            nye meldinger og treff i lagrede søk. Du kan trekke tilbake dette
            når som helst under <strong>Profil → Varslinger</strong>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Hva lagres på serveren</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Brukerprofil</strong>: navn, e-postadresse og eventuelt
              profilbilde, bio og sted.
            </li>
            <li>
              <strong>Annonser</strong> du har lagt ut, med tilhørende bilder,
              beskrivelse og lokasjon.
            </li>
            <li>
              <strong>Meldinger</strong> mellom deg og andre brukere.
            </li>
            <li>
              <strong>Favoritter</strong> og <strong>lagrede søk</strong> du
              har registrert.
            </li>
            <li>
              <strong>Anonyme visninger</strong> av annonser, for å gi selger
              statistikk. Disse knyttes til en sesjons-ID, ikke til personlige
              opplysninger.
            </li>
            <li>
              <strong>Push-abonnement</strong> (valgfritt): endepunkt,
              kryptografiske nøkler og brukeragent for den aktuelle enheten.
            </li>
            <li>
              <strong>Varslingsinnstillinger</strong> (valgfritt): om du ønsker
              push-varsler for nye meldinger og treff i lagrede søk.
            </li>
          </ul>
          <p className="mt-4">
            Data lagres og behandles av <strong>Lovable Cloud</strong> på
            servere i EU. Du kan lese databehandlerens personvernerklæring
            her:{" "}
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
            sikkerhet i tjenesten). Push-varsler behandles med{" "}
            <strong>samtykke</strong>, som du gir når du aktiverer funksjonen i
            nettleseren og som du kan trekke tilbake når som helst.
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
          <h2 className="font-display text-2xl">Sletting av brukerkonto</h2>
          <p className="mt-3">
            Du kan slette kontoen din når som helst fra{" "}
            <strong>Profil → Kontoinnstillinger</strong>. Av sikkerhetshensyn
            settes kontoen først som <em>inaktiv</em> i 7 dager. I denne
            perioden kan du logge inn igjen for å angre slettingen. Etter 7
            dager fjernes kontoen permanent fra systemet.
          </p>
          <p className="mt-3">
            For å bevare samtalehistorikken for andre brukere blir profilen din{" "}
            <strong>anonymisert</strong> ved permanent sletting: navn,
            profilbilde, bio og lokasjon fjernes, og du vises som "Slettet
            bruker" i tidligere meldinger. Annonsene dine slettes. E-postadresse
            og innloggingsdata fjernes fullstendig.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Tredjeparter</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Lovable Cloud</strong> — databehandler for autentisering,
              database og fillagring. Servere i EU.
            </li>
            <li>
              <strong>Google Fonts</strong> — skrifttyper lastes direkte fra
              Googles servere. IP-adressen din blir synlig for Google ved
              henting av skrifttypene.
            </li>
            <li>
              <strong>OpenStreetMap / CARTO</strong> — kartfliser og
              adressesøk (Nominatim) for visning og geokoding av lokasjon på
              annonser. IP-adressen din blir synlig for disse tjenestene når
              kart eller adressesøk brukes.
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
