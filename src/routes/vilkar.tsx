import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/vilkar")({
  head: () => ({
    meta: [
      { title: "Brukervilkår — Kaupet.no" },
      {
        name: "description",
        content:
          "Reglene for bruk av Kaupet.no. Hva du kan og ikke kan gjøre på markedsplassen, og hvilke rettigheter og plikter du har som bruker.",
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
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Brukervilkår</p>
        <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">Brukervilkår for Kaupet.no</h1>
        <p className="mt-3 text-sm text-muted-foreground">Versjon 1.1 — sist oppdatert 8. juni 2026</p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-foreground/90">
        <section>
          <p>
            Disse vilkårene gjelder for all bruk av Kaupet.no. Ved å opprette en konto eller bruke tjenesten godtar du
            vilkårene. Les dem nøye — de inneholder viktig informasjon om dine rettigheter og plikter.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">1. Om Kaupet.no</h2>
          <p className="mt-3">
            Kaupet.no er en norsk markedsplass for kjøp og salg av varer og tjenester mellom privatpersoner og
            næringsdrivende. Kaupet formidler kontakt mellom kjøper og selger, men er <strong>ikke part</strong> i
            avtalen som inngås mellom brukerne. Vi tilbyr ikke betalingsformidling, frakttjenester eller garanti for
            handler som gjennomføres via tjenesten.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">2. Hvem kan bruke tjenesten</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>Du må være minst 15 år. Er du under 18 må du ha samtykke fra foresatte.</li>
            <li>Du kan ha kun én personlig konto. Næringsdrivende kan i tillegg ha én konto per virksomhet.</li>
            <li>Opplysningene du oppgir om deg selv skal være korrekte og oppdaterte.</li>
            <li>
              Du er ansvarlig for å holde innloggingsinformasjonen hemmelig. All aktivitet på kontoen din regnes som
              din egen.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">3. Akseptabel bruk</h2>
          <p className="mt-3">Det er ikke tillatt å bruke Kaupet.no til:</p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              Salg av ulovlige varer eller tjenester, herunder våpen, narkotika, kopivarer, stjålne gjenstander,
              levende dyr i strid med dyrevelferdsloven, eller aldersbegrensede varer til mindreårige.
            </li>
            <li>Svindel, falske annonser, villedende prising eller "lokketilbud".</li>
            <li>
              Hets, trakassering, diskriminering, trusler eller deling av andres personopplysninger uten samtykke.
            </li>
            <li>
              Spam, masseutsending av meldinger, automatisert skraping av innhold eller omgåelse av tekniske
              sikkerhetstiltak.
            </li>
            <li>Å opprette flere kontoer for å omgå utestengelse eller andre sanksjoner.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">4. Annonseregler</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>Annonsen skal gjelde en reell vare eller tjeneste som du har rett til å selge.</li>
            <li>Velg riktig kategori og oppgi pris i norske kroner.</li>
            <li>Bruk egne bilder eller bilder du har rett til å bruke.</li>
            <li>Ikke legg inn kontaktinformasjon eller eksterne lenker i tittel eller bilder.</li>
            <li>Ikke publiser duplikater av samme annonse.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">5. Handel mellom brukere</h2>
          <p className="mt-3">
            Kaupet formidler kontakt mellom kjøper og selger. Betaling, frakt og oppgjør er en sak mellom partene, og
            Kaupet er ikke ansvarlig for gjennomføringen av handelen. Vi anbefaler:
          </p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>Møt på et offentlig sted ved overlevering.</li>
            <li>Kontroller varen før du betaler.</li>
            <li>Vær forsiktig med forskuddsbetaling, særlig ved sending.</li>
            <li>Be om kvittering og dokumenter handelen.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">6. Meldinger og vurderinger</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>Meldinger skal være saklige og relatert til handel på Kaupet.</li>
            <li>Vurderinger skal være ærlige og basert på en reell handel mellom partene.</li>
            <li>Falske, manipulerende eller hevnmotiverte vurderinger vil bli fjernet.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">7. Immaterielle rettigheter</h2>
          <p className="mt-3">
            Du beholder rettighetene til innholdet du publiserer (tekst, bilder mv.), men gir Kaupet en vederlagsfri,
            ikke-eksklusiv lisens til å lagre, vise og distribuere innholdet på tjenesten så lenge annonsen er
            publisert. Innhold du publiserer må ikke krenke tredjeparts rettigheter.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">8. Moderering og sanksjoner</h2>
          <p className="mt-3">
            Kaupet kan, etter eget skjønn, fjerne annonser og meldinger, skjule innhold, midlertidig suspendere eller
            permanent utestenge brukere og IP-adresser ved brudd på vilkårene. Ved alvorlige eller gjentatte brudd kan
            dette skje uten forhåndsvarsel. Moderasjonshandlinger logges internt.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">9. Rapportering</h2>
          <p className="mt-3">
            Brukere kan rapportere annonser, meldinger og profiler som bryter vilkårene. Misbruk av rapportfunksjonen
            (for eksempel grunnløse masserapporter) kan i seg selv medføre sanksjoner.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">10. Tilgjengelighet</h2>
          <p className="mt-3">
            Tjenesten leveres "som den er". Kaupet garanterer ikke uavbrutt drift, og vi kan når som helst endre,
            begrense eller avvikle funksjoner uten forhåndsvarsel.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">11. Ansvarsbegrensning</h2>
          <p className="mt-3">
            Kaupet er ikke ansvarlig for kvalitet, lovlighet, sikkerhet eller levering av varer og tjenester som
            omsettes mellom brukere, eller for indirekte tap som måtte oppstå som følge av bruk av tjenesten. Denne
            begrensningen gjelder så langt loven tillater.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">12. Personvern</h2>
          <p className="mt-3">
            Vår behandling av personopplysninger er beskrevet i{" "}
            <Link to="/personvern" className="underline hover:text-foreground">
              personvernerklæringen
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">13. Sletting av konto</h2>
          <p className="mt-3">
            Du kan be om sletting av kontoen din fra profilsiden. Slettingen har 7 dagers angrefrist før dataene
            fjernes permanent. Enkelte opplysninger kan bli beholdt så lenge det er nødvendig for å oppfylle
            rettslige forpliktelser.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">14. Endringer i vilkårene</h2>
          <p className="mt-3">
            Kaupet kan oppdatere disse vilkårene. Vesentlige endringer varsles på nettsiden. Fortsatt bruk av
            tjenesten etter at endringer er publisert regnes som aksept av de nye vilkårene.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">15. Lovvalg og verneting</h2>
          <p className="mt-3">
            Vilkårene reguleres av norsk rett. Tvister søkes løst i minnelighet. Hvis dette ikke lykkes, er Oslo
            tingrett verneting. Forbrukere kan også klage til{" "}
            <a
              href="https://www.forbrukertilsynet.no"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Forbrukertilsynet
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl">16. Kontakt</h2>
          <p className="mt-3">
            Kaupet.no forvaltes av <strong>Happy Pixel AS</strong>, organisasjonsnummer{" "}
            <strong>933 197 867</strong>. Spørsmål om vilkårene kan rettes til kontaktadressen
            oppgitt i{" "}
            <Link to="/personvern" className="underline hover:text-foreground">
              personvernerklæringen
            </Link>
            .
          </p>
        </section>

        <section id="kjopsvilkar" className="scroll-mt-24">
          <h2 className="font-display text-2xl">17. Vilkår for kjøp av fremhevet annonse</h2>
          <p className="mt-3">
            Disse vilkårene gjelder når du som registrert bruker kjøper «fremhevet annonse» fra
            Kaupet.no. Vilkårene er en del av brukervilkårene og gjelder i tillegg til disse.
          </p>
          <ul className="mt-3 space-y-2 list-disc pl-5">
            <li>
              <strong>Tjenesteleverandør:</strong> Kaupet.no forvaltes av{" "}
              <strong>Happy Pixel AS</strong>, organisasjonsnummer <strong>933 197 867</strong>.
              Kontaktopplysninger er oppgitt i{" "}
              <Link to="/personvern" className="underline hover:text-foreground">
                personvernerklæringen
              </Link>
              .
            </li>
            <li>
              <strong>Tjenesten:</strong> Én navngitt annonse vises i en egen «Fremhevet»-seksjon øverst i
              relevante søk og kategorisider. Inntil to fremhevede annonser vises om gangen — om flere
              annonser har aktiv fremheving, velges to tilfeldig per visning. Tjenesten gis for valgt
              antall dager (3 eller 5).
            </li>
            <li>
              <strong>Pris:</strong> Gjeldende pris vises i kjøpsdialogen før betaling, og er i norske
              kroner.
            </li>
            <li>
              <strong>Betaling:</strong> Betaling skjer gjennom vår transaksjonspartner og belastes
              umiddelbart ved kjøp.
            </li>
            <li>
              <strong>Levering:</strong> Fremhevingen aktiveres så snart Kaupet mottar bekreftet betaling, og varer i valgt antall dager fra aktiveringstidspunktet.
            </li>
            <li>
              <strong>Angrerett:</strong> Tjenesten er digitalt innhold som leveres umiddelbart. Du må
              samtykke i kjøpsdialogen til at leveringen starter med en gang og at angreretten dermed
              bortfaller, jf. angrerettloven § 22 bokstav n.
            </li>
            <li>
              <strong>Avbrutt levering:</strong> Hvis fremhevingen ikke kan leveres på grunn av teknisk
              feil hos oss, eller fordi annonsen fjernes av Kaupet uten brukerens skyld, kan du kontakte
              support for refusjon av den ubrukte delen av perioden. Hvis du selv setter annonsen til
              solgt, deaktiverer eller sletter den i fremhevingsperioden, refunderes ikke kjøpet.
            </li>
            <li>
              <strong>Reklamasjon og kontakt:</strong> Henvendelser om kjøpet rettes til kontaktadressen
              oppgitt i{" "}
              <Link to="/personvern" className="underline hover:text-foreground">
                personvernerklæringen
              </Link>
              .
            </li>
          </ul>
        </section>
      </div>
    </article>
  );
}
