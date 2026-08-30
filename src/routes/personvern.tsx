import { createFileRoute, Link } from "@tanstack/react-router";
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
          <p className="mt-3 text-sm text-muted-foreground">Sist oppdatert 29. august 2026</p>
        </header>
      )}

      <div className="space-y-10 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Hos Kaupet.no lagrer vi kun det som er nødvendig for at tjenesten skal fungere. Vi
            bruker <strong>ingen tredjepartssporing</strong>,{" "}
            <strong>ingen markedsføringscookies</strong> og{" "}
            <strong>ingen eksterne analyseplattformer</strong>. Derfor benytter vi heller ikke en
            cookie-banner som ber om samtykke. Vi lagrer kun det som er strengt nødvendig for at
            tjenesten skal fungere. Alle data som lagres er beskrevet i sin helhet lenger ned på
            denne siden.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-2xl">Informasjonen vi lagrer</h2>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium select-none list-none">
              <span>I våre systemer</span>
              <span className="text-muted-foreground transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="space-y-2 border-t border-border px-4 py-4 list-disc pl-9">
              <li>
                <strong>Brukerprofil</strong>: navn og eventuelt profilbilde. Visningsnavn og
                profilbilde er <strong>offentlig synlig</strong> for alle besøkende på din
                profilside. E-postadressen er privat og vises ikke offentlig.
              </li>
              <li>
                <strong>Annonser</strong> du har lagt ut (salg eller «ønskes kjøpt»), med tilhørende
                bilder, beskrivelse, kategori og lokasjon (postnummer, by og koordinater for
                kartvisning). Utkast som ikke er publisert slettes automatisk etter 90 dager uten
                aktivitet. Du får et varsel i innboksen 7 dager før dette skjer.
              </li>
              <li>
                <strong>Meldinger</strong> mellom deg og andre brukere.
              </li>
              <li>
                <strong>Lest-status på samtaler</strong> — tidspunkt for når du sist åpnet en
                samtale, brukt til ulest-indikatoren i meldingsinnboksen.
              </li>
              <li>
                <strong>Favoritter</strong> du har lagret.
              </li>
              <li>
                <strong>Vurderinger</strong> du gir eller mottar etter et salg (stjerner og
                eventuell kommentar). Disse er <strong>offentlig synlige</strong> på brukerprofilen.
              </li>
              <li>
                <strong>Lagrede søk</strong> med søkekriterier (kategori, pris, sted og lignende
                strukturerte filtre, ikke fritekst), og varsler om nye treff på disse søkene. Slike
                varsler slettes 180 dager etter at du har lest dem.
              </li>
              <li>
                <strong>Rapporter</strong> du sender inn om upassende annonser, lagres slik at
                moderator kan behandle dem, i inntil 3 år etter at saken er avsluttet.
              </li>
              <li>
                <strong>Blokkeringer</strong> — hvilke brukere eller samtaler du har blokkert. Dette
                er privat og kun synlig for deg.
              </li>
              <li>
                <strong>Bekreftede salg</strong> — når en selger markerer en annonse som solgt via
                en samtale, lagres koblingen mellom annonse, kjøper og selger. Denne er kun synlig
                for partene i salget.
              </li>
              <li>
                <strong>Visninger av annonser</strong>, for å gi selger et visningstall. Vi lagrer
                et aggregert antall per annonse. <strong>Vi lagrer ikke</strong> hvem som har sett
                den eller en identifikator som kobler flere besøk til samme person. For å hindre at
                samme nettverk teller flere visninger sekundet etter sekundet, godtar vi maks én
                telling per annonse per nettverk hvert 30. minutt.
              </li>
              <li>
                <strong>Push-varslinger</strong> — hvis du slår på varsler, lagrer vi et
                kryptografisk abonnementsnøkkelpar (offentlig/privat) eller enhets-token,
                nettleser-/enhetsinformasjon og dine preferanser for hva du vil varsles om (nye
                meldinger, lagrede søk, prisfall og lignende).
              </li>
              <li>
                <strong>Betaling og annonsepromotering</strong> — hvis du betaler for å fremheve en
                annonse, lagres transaksjonsdata fra betalingsleverandøren Vipps, samt hvilken
                annonse betalingen gjelder.
              </li>
              <li>
                <strong>Varsler om prisendringer</strong> — hvis du har lagt til en annonse som
                favoritt eller har et lagret søk, kan vi lagre at det er sendt varsel til deg om
                prisendring eller nytt treff, slik at du ikke varsles flere ganger om det samme.
                Slike varsler slettes 180 dager etter at du har lest dem.
              </li>
              <li>
                <strong>Kjøretøyoppslag</strong> — hvis du registrerer et kjøretøy, lagrer vi
                registreringsnummeret og resultatet av oppslaget mot Statens vegvesen i 90 dager,
                for å hindre misbruk og varsle deg hvis samme skilt tidligere er slått opp med et
                annet resultat.
              </li>
              <li>
                <strong>Moderering</strong> — ved brudd på reglene kan administrator registrere en{" "}
                <em>utestengelse</em>, <em>midlertidig suspensjon</em> eller <em>IP-blokkering</em>.
                Ved IP-blokkering lagres IP-adressen så lenge blokkeringen er aktiv, og fjernes når
                den oppheves. Slike administrative handlinger logges internt med tidspunkt og årsak
                i 3 år.
              </li>
              <li>
                <strong>Sletteforespørsler</strong> — når du ber om å slette kontoen, lagrer vi
                e-post og tidsstempel i den 7 dager lange angrefristen før permanent sletting
                utføres.
              </li>
              <li>
                <strong>Feilsøkingslogger</strong> — tekniske serverfeil logges i 90 dager for å
                rette feil i tjenesten. Loggen filtreres for å ikke inneholde personopplysninger.
              </li>
            </ul>
            <p className="border-t border-border px-4 py-3 text-muted-foreground">
              Data lagres og behandles av <strong>Supabase</strong> på servere i Europa. Du kan lese
              deres personvernerklæring på{" "}
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
          </details>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium select-none list-none">
              <span>Lokalt i nettleseren din</span>
              <span className="text-muted-foreground transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="space-y-2 border-t border-border px-4 py-4 list-disc pl-9">
              <li>
                <strong>Innloggingssesjon</strong> — nødvendig for at du skal kunne være logget inn
                mellom besøk. Lagres i nettleserens <code>localStorage</code> av
                autentiseringsleverandøren Supabase.
              </li>
              <li>
                <strong>kaupet_recent_searches_v1</strong> — de siste søkene du har gjort, slik at
                du kan navigere tilbake til søkereslutatene dine etter å ha sett på en annonse.
                Forlater ikke enheten din.
              </li>
              <li>
                <strong>kaupet_view_mode</strong> — husker om du foretrekker annonser vist i
                rutenett eller liste. Forlater ikke enheten din.
              </li>
              <li>
                <strong>kaupet_theme</strong> — husker om du foretrekker lyst, mørkt eller
                systemstyrt fargetema. Forlater ikke enheten din.
              </li>
              <li>
                <strong>kaupet_draft_ny_annonse</strong>, <strong>kaupet_draft_id</strong>,{" "}
                <strong>kaupet_draft_want_listing</strong> og{" "}
                <strong>kaupet_draft_want_listing_id</strong> — utkast til salgsannonse eller
                «ønskes kjøpt»-annonse (tittel, pris, beskrivelse m.m.) lagres automatisk mens du
                fyller ut registreringen, slik at du ikke mister innholdet ved utilsiktet lukking.
                Slettes når annonsen er publisert eller forkastet.
              </li>
              <li>
                <strong>kaupet_push_msg_hint_dismissed_v1</strong>,{" "}
                <strong>kaupet_360_hint_seen</strong> og{" "}
                <strong>kaupet_onboarding_completed_v1</strong> — husker at du har lukket en
                informasjonsmelding eller sett en veiledning, slik at den ikke vises på nytt.
              </li>
              <li>
                <strong>kaupet-pending-auth-intent</strong> — husker en handling du forsøkte (f.eks.
                å legge til favoritt) mens du ikke var innlogget, slik at handlingen fullføres
                automatisk etter innlogging. Lagres i <code>sessionStorage</code> og slettes
                automatisk når fanen lukkes eller handlingen er fullført.
              </li>
            </ul>
            <p className="border-t border-border px-4 py-3 text-muted-foreground">
              I tillegg lagrer vi <strong>kaupet:lastAnnonserSearch</strong> i nettleserens{" "}
              <code>sessionStorage</code>, som — i motsetning til de andre nøklene over — slettes
              automatisk når du lukker fanen. Denne brukes til å ta deg tilbake til søkeresultatene
              dine etter å ha sett på en annonse. Bildeutkast til en påbegynt annonse mellomlagres
              tilsvarende i nettleserens <code>IndexedDB</code>, og slettes sammen med det tekstlige
              utkastet.
            </p>
          </details>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium select-none list-none">
              <span>Lokalt i appen (iOS og Android)</span>
              <span className="text-muted-foreground transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <ul className="space-y-2 border-t border-border px-4 py-4 list-disc pl-9">
              <li>
                <strong>kaupet.app.location</strong> — husker posisjonen og søkeradius du sist
                brukte i stedsfilteret (koordinater, radius i km og stedsnavn), slik at filteret er
                forhåndsutfylt neste gang du åpner appen. Selve lagringen forlater ikke enheten din,
                men når du utfører et geografisk søk sendes koordinatene og radiusen til Kaupet for
                å finne relevante annonser — se «Kartverket og OpenStreetMap» under Tredjeparter for
                hvordan adressesøk og kartvisning fungerer.
              </li>
              <li>
                <strong>kaupet_onboarding_completed_v1</strong> — husker at du har fullført
                introduksjonsguiden ved første gangs bruk av appen, slik at den ikke vises på nytt.
              </li>
            </ul>
          </details>
        </section>

        <section>
          <h2 className="font-display text-2xl">Push-varslinger</h2>
          <p className="mt-3">
            Push-varslinger er <strong>frivillige og krever eksplisitt samtykke</strong>. Du
            aktiverer dem selv i nettleseren eller appen. Vi lagrer kun det som er nødvendig for å
            sende varsler:
          </p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Abonnementsdata</strong> — i nettleseren et endepunkt og et kryptografisk
              nøkkelpar generert av nettleseren din; i appen en enhets-token utstedt av Apple (APNs)
              eller Google (FCM). Vi kan ikke bruke disse til å spore deg på tvers av nettsteder.
            </li>
            <li>
              <strong>Enhets- og nettleserinformasjon</strong> — brukes til å sende varslet til
              riktig enhet.
            </li>
            <li>
              <strong>Varselformål</strong> — hvilke hendelser du vil varsles om (for eksempel nye
              meldinger eller treff på lagrede søk).
            </li>
          </ul>
          <p className="mt-4">
            Du kan når som helst <strong>skru av varsler</strong> i nettleserens innstillinger eller
            i profilen din på Kaupet.no. Da slettes abonnementsdataene fra serveren. Hvis du kun
            trekker tilbake tillatelsen i telefonens/nettleserens systeminnstillinger uten å skru av
            varsler i Kaupet, kan abonnementet bli stående til varseltjenesten (Apple/Google eller
            nettleseren) rapporterer at det ikke lenger er gyldig — det brukes uansett ikke til noe
            før det.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">AI-basert kategoriforslag</h2>
          <p className="mt-3">
            Når du skriver tittelen på en ny annonse, foreslår Kaupet en kategori. Dette skjer først
            med vår egen, interne statistikk basert på hva andre brukere har valgt for lignende
            titler. Ingen data forlater Kaupets servere i dette tilfellet. Bare når denne interne
            modellen er usikker, sender vi de <strong>første 100 tegnene</strong> av annonsetittelen
            til <strong>Mistral AI</strong> for et forslag. Vi sender aldri e-postadressen din,
            bruker-ID-en din eller annen personlig informasjon i denne forespørselen. Forslaget er
            må bekreftes av deg før annonsen publiseres. Du kan også velge kategori selv.
          </p>
          <p className="mt-3">
            Mistral AI er en selvstendig databehandler med driftssted i EU. Data sendt via deres API
            brukes ikke til modelltrening som standard. Du kan lese mer i{" "}
            <a
              href="https://legal.mistral.ai/terms/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Mistral AIs personvernerklæring
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Hvor lenge vi lagrer data</h2>
          <p className="mt-3">
            Vi lagrer opplysninger så lenge du har en aktiv konto og de er nødvendige for tjenesten.
            Annonser, meldinger og vurderinger beholdes til du selv sletter dem eller sletter
            kontoen din. Datatyper med en kortere, fast frist er angitt eksplisitt i listen over
            («Informasjonen vi lagrer») — blant annet utkast (90 dager), leste varsler (180 dager),
            kjøretøyoppslag og feilsøkingslogger (90 dager), og angrefristen på 7 dager ved
            kontosletting. Den fullstendige, interne oversikten over lagringstid per datatype føres
            i Kaupets behandlingsprotokoll og oppdateres i takt med denne erklæringen.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Juridisk grunnlag</h2>
          <p className="mt-3">
            Kjernetjenesten (konto, annonser, meldinger, favoritter, lagrede søk, betaling for
            fremheving) behandles på grunnlag av <strong>avtale</strong> — det er nødvendig for å
            levere tjenesten du har bedt om.
          </p>
          <p className="mt-3">
            Push-varslinger, e-postvarsler og AI-kategoriforslaget behandles på grunnlag av{" "}
            <strong>samtykke</strong> du selv gir ved å aktivere funksjonen.
          </p>
          <p className="mt-3">
            Sikkerhet, misbruksforebygging (bl.a. IP-blokkering, bot-beskyttelse med Cloudflare
            Turnstile og hastighetsbegrensning), moderering, feilsøking og aggregert bruksstatistikk
            til produktforbedring behandles på grunnlag av <strong>berettiget interesse</strong>. Vi
            har vurdert at denne interessen ikke går ut over din interesse i personvern, blant annet
            fordi bruksstatistikken ikke inneholder noen identifikator som kan kobles til deg.
          </p>
          <p className="mt-3">
            Enkelte opplysninger (f.eks. transaksjonsdata knyttet til betaling) kan i tillegg
            behandles for å oppfylle en <strong>rettslig forpliktelse</strong>, som bokføringsloven.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Dine rettigheter</h2>
          <p className="mt-3">
            Du har rett til innsyn, retting, sletting og begrensning av opplysningene vi har om deg.
            Du kan protestere mot behandling som bygger på vår berettigede interesse. Der
            behandlingen bygger på samtykke (push-varsler, e-postvarsler), kan du trekke samtykket
            tilbake når som helst, like enkelt som du ga det. Rett til dataportabilitet gjelder for
            opplysninger du selv har gitt oss når behandlingen bygger på samtykke eller avtale og
            skjer automatisk.
          </p>
          <p className="mt-3">
            Kontakt oss på{" "}
            <a
              href="mailto:kontakt@kaupet.no"
              className="text-primary underline underline-offset-2"
            >
              kontakt@kaupet.no
            </a>{" "}
            for å utøve rettighetene dine. Du kan også klage til{" "}
            <a
              href="https://www.datatilsynet.no"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Datatilsynet
            </a>
            .
          </p>
          <p className="mt-3">
            Tjenesten er ikke rettet mot barn, og krever at brukeren er minst 15 år ved registrering
            av konto. Brukere under 18 år må ha samtykke fra foresatte.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Automatiserte avgjørelser</h2>
          <p className="mt-3">
            Kaupet fatter ingen avgjørelser om deg utelukkende basert på automatisert behandling
            eller profilering som har rettsvirkning for deg eller på tilsvarende måte påvirker deg i
            vesentlig grad. AI-basert kategoriforslag (se over) er kun et forslag du alltid kan
            overstyre før publisering.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Sletting av brukerkonto</h2>
          <p className="mt-3">
            Du kan slette kontoen din når som helst fra <strong>Profil → Kontoinnstillinger</strong>
            . Av sikkerhetshensyn settes kontoen først som <em>inaktiv</em> i 7 dager. I denne
            perioden kan du logge inn igjen for å angre slettingen. Etter 7 dager fjernes kontoen
            permanent fra systemet.
          </p>
          <p className="mt-3">
            Ved permanent sletting fjernes{" "}
            <strong>salgsannonsene og «ønskes kjøpt»-annonsene</strong> dine helt. For å bevare
            samtalehistorikken for andre brukere blir profilen din <strong>anonymisert</strong>:
            navn og profilbilde fjernes, og du vises som «Slettet bruker» i tidligere meldinger og
            vurderinger. E-postadresse og innloggingsdata fjernes fullstendig.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">Tredjeparter</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Supabase</strong> — databehandler for autentisering, database og fillagring.
            </li>
            <li>
              <strong>Cloudflare</strong> — vi bruker Cloudflare Workers som driftsplattform. Det
              betyr at trafikk til og fra Kaupet.no går gjennom Cloudflare sin infrastruktur, som
              dermed ser IP-adressen din og annen teknisk informasjon om forespørselen din.
              Cloudflare Turnstile brukes i tillegg til å skille mennesker fra roboter ved
              innlogging, registrering og publisering av annonser — dette innebærer at Cloudflare
              ser tekniske signaler om nettleseren og enheten din på disse sidene. Du kan lese
              Cloudflares personvernerklæring på{" "}
              <a
                href="https://www.cloudflare.com/privacypolicy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                cloudflare.com/privacypolicy
              </a>
              .
            </li>
            <li>
              <strong>Vipps</strong> — betalingsleverandør for kjøp av annonsepromotering. Vipps
              behandler betalingsopplysninger som navn og telefonnummer i forbindelse med
              transaksjonen. Du kan lese Vipps sin personvernerklæring på{" "}
              <a
                href="https://www.vipps.no/personvern/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                vipps.no/personvern
              </a>
              .
            </li>
            <li>
              <strong>Mistral AI</strong> — mottar de første 100 tegnene av annonsetittelen når vårt
              interne kategoriforslag er usikkert, se «AI-basert kategoriforslag» over. Du kan lese
              deres personvernerklæring på{" "}
              <a
                href="https://legal.mistral.ai/terms/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                legal.mistral.ai/terms/privacy-policy
              </a>
              .
            </li>
            <li>
              <strong>Resend</strong> — sender transaksjonelle e-postvarsler du har bedt om (nye
              meldinger, treff på lagrede søk og lignende) på våre vegne. Du kan lese deres
              personvernerklæring på{" "}
              <a
                href="https://resend.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                resend.com/legal/privacy-policy
              </a>
              .
            </li>
            <li>
              <strong>Statens vegvesen (Datautlevering)</strong> — når du registrerer et kjøretøy
              med registreringsnummer, sender vi nummeret til Statens vegvesen for å hente
              kjøretøydata automatisk.
            </li>
            <li>
              <strong>Google Firebase Cloud Messaging (FCM)</strong> — brukes for å sende
              push-varsler til Kaupet-appen på Android, og til iOS via Apples varslingstjeneste
              (APNs). Varsler leveres via Googles infrastruktur, som dermed ser enhetsinformasjon og
              varselinnhold. Dette kan innebære overføring av data til land utenfor EØS, basert på
              Googles standard personvernbestemmelser (SCC) for slike overføringer. FCM brukes kun
              når du har aktivert push-varsler. Du kan lese Googles personvernerklæring på{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                policies.google.com/privacy
              </a>
              .
            </li>
            <li>
              <strong>Kartverket og OpenStreetMap</strong> — Kartverket leverer kartfliser, mens
              adressesøk i kartvisningen bruker Nominatim fra OpenStreetMap Foundation, for visning
              og geokoding av lokasjon på annonser. Adressesøk utføres kun når du eksplisitt trykker
              «Søk» i et adressefelt — IP-adressen din blir da synlig for OpenStreetMap Foundation.
              Kartfliser fra Kartverket lastes automatisk når et kart vises.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Endringer</h2>
          <p className="mt-3">
            Vi oppdaterer denne erklæringen ved endringer i tjenesten. Dato øverst på siden viser
            når den sist ble endret. Ved vesentlige endringer varsler vi deg også på epost.
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
