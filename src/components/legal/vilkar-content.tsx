import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

// Med onOpen (f.eks. i en skuff over registreringsskjemaet) åpnes
// dokumentet på stedet i stedet for å navigere bort.
export function LegalDocLink({
  to,
  onOpen,
  children,
}: {
  to: "/personvern" | "/vilkar" | "/vilkar/bedrift";
  onOpen?: () => void;
  children: ReactNode;
}) {
  const className = "underline hover:text-foreground";
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={className}>
        {children}
      </button>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function KontaktEpost() {
  return (
    <a href="mailto:kontakt@kaupet.no" className="underline hover:text-foreground">
      kontakt@kaupet.no
    </a>
  );
}

export function VilkarContent({
  onOpenPersonvern,
  onOpenBedriftsvilkar,
}: {
  onOpenPersonvern?: () => void;
  onOpenBedriftsvilkar?: () => void;
}) {
  return (
    <div className="space-y-10 text-sm leading-relaxed text-foreground/90">
      <section>
        <p className="text-muted-foreground">Sist oppdatert 27. september 2026</p>
        <p className="mt-3">
          Disse vilkårene gjelder når du bruker Kaupet.no som privatperson. Ved å opprette en konto
          eller bruke tjenesten godtar du vilkårene. Les dem nøye — de inneholder viktig informasjon
          om dine rettigheter og plikter.
        </p>
        <p className="mt-3">
          Bruker du Kaupet på vegne av en virksomhet, gjelder{" "}
          <LegalDocLink to="/vilkar/bedrift" onOpen={onOpenBedriftsvilkar}>
            vilkårene for bedrifter
          </LegalDocLink>{" "}
          for det du gjør på vegne av virksomheten.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">1. Om Kaupet.no</h2>
        <p className="mt-3">
          Kaupet.no er en norsk annonsetjeneste der privatpersoner og bedrifter legger ut annonser
          for varer de selv selger. Annonser fra bedrifter er merket som bedriftsannonser. Kaupet
          selger ingen varer selv. Vi formidler kontakt mellom kjøper og selger, og handelen skjer
          direkte mellom dem. Kaupet er <strong>ikke part</strong> i avtalen som inngås mellom
          brukerne. Vi tilbyr ikke betalingsformidling, frakttjenester eller garanti for handler som
          gjennomføres via tjenesten.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">2. Hvem kan bruke tjenesten</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>Du må være minst 15 år. Er du under 18 må du ha samtykke fra foresatte.</li>
          <li>
            Du kan ha kun én personlig konto. Du kan i tillegg være medlem av en eller flere
            bedriftskontoer.
          </li>
          <li>Opplysningene du oppgir om deg selv skal være korrekte og oppdaterte.</li>
          <li>
            Du er ansvarlig for å holde innloggingsinformasjonen hemmelig. All aktivitet på kontoen
            din regnes som din egen.
          </li>
          <li>
            Den personlige kontoen er for privat salg, av egne ting eller ting du har rett til å
            selge. Kjøper du varer for å selge dem videre, eller selger du jevnlig for å tjene
            penger, driver du næringsvirksomhet og skal bruke en bedriftskonto.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">3. Akseptabel bruk</h2>
        <p className="mt-3">Det er ikke tillatt å bruke Kaupet.no til:</p>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>
            Salg av ulovlige varer eller tjenester, herunder våpen, narkotika, kopivarer, stjålne
            gjenstander eller aldersbegrensede varer til mindreårige.
          </li>
          <li>
            Salg eller formidling av levende dyr. Dette gjelder uavhengig av dyreart. Utstyr,
            tilbehør og fôr til kjæledyr er tillatt.
          </li>
          <li>Svindel, falske annonser, villedende prising eller «lokketilbud».</li>
          <li>Å selge som næringsdrivende og samtidig gi inntrykk av å være privatperson.</li>
          <li>
            Hets, trakassering, diskriminering, trusler eller deling av andres personopplysninger
            uten samtykke.
          </li>
          <li>
            Spam, masseutsending av meldinger, automatisert skraping av innhold eller omgåelse av
            tekniske sikkerhetstiltak.
          </li>
          <li>Å opprette flere kontoer for å omgå utestengelse eller andre sanksjoner.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">4. Annonseregler</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>Annonsen skal gjelde en reell vare som du eier eller har rett til å selge.</li>
          <li>Velg riktig kategori og oppgi pris i norske kroner.</li>
          <li>Bruk egne bilder eller bilder du har rett til å bruke.</li>
          <li>Ikke legg inn kontaktinformasjon eller eksterne lenker i tittel eller bilder.</li>
          <li>Ikke publiser duplikater av samme annonse.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">5. Handel mellom brukere</h2>
        <p className="mt-3">
          Kaupet formidler kontakt mellom kjøper og selger. Betaling, frakt og oppgjør er en sak
          mellom partene, og Kaupet er ikke ansvarlig for gjennomføringen av handelen.
        </p>
        <p className="mt-3">
          Hvilke regler som gjelder, avhenger av hvem du handler med. Kjøper du av en privatperson,
          gjelder kjøpsloven, og det er ingen angrerett. Kjøper du av en bedrift, gjelder
          forbrukerkjøpsloven, og ved kjøp på avstand har du som hovedregel angrerett etter
          angrerettloven. Det er bedriften, ikke Kaupet, som har ansvaret for å oppfylle disse
          rettighetene.
        </p>
        <p className="mt-3">Vi anbefaler:</p>
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
        <h2 className="font-display text-2xl">7. Innhold du publiserer</h2>
        <p className="mt-3">
          Du beholder rettighetene til innholdet du publiserer (tekst, bilder mv.), men gir Kaupet
          en vederlagsfri, ikke-eksklusiv lisens til å lagre, tilpasse (for eksempel beskjære og
          komprimere bilder) og vise innholdet så lenge det er nødvendig for å levere tjenesten.
          Innhold du publiserer må ikke krenke tredjeparts rettigheter.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">8. Moderering, sanksjoner og klage</h2>
        <p className="mt-3">
          Kaupet kan fjerne annonser og meldinger, skjule innhold, midlertidig suspendere eller
          permanent utestenge brukere og IP-adresser ved brudd på vilkårene. Ved alvorlige eller
          gjentatte brudd kan dette skje uten forhåndsvarsel. Moderasjonshandlinger logges internt.
        </p>
        <p className="mt-3">
          Fjerner eller begrenser vi innholdet ditt eller kontoen din, får du en begrunnelse. Mener
          du avgjørelsen er feil, kan du klage til <KontaktEpost />, så vurderer vi saken på nytt.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">9. Rapportering</h2>
        <p className="mt-3">
          Brukere kan rapportere annonser, meldinger og profiler som bryter vilkårene. Misbruk av
          rapportfunksjonen (for eksempel grunnløse masserapporter) kan i seg selv medføre
          sanksjoner.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">10. Tilgjengelighet</h2>
        <p className="mt-3">
          Tjenesten leveres «som den er». Kaupet garanterer ikke uavbrutt drift, og vi forbeholder
          oss retten til å endre, begrense eller avvikle funksjoner. Har du kjøpt en tjeneste,
          gjelder vilkårene for kjøpet i punkt 17.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">11. Ansvarsbegrensning</h2>
        <p className="mt-3">
          Kaupet er ikke ansvarlig for kvalitet, lovlighet, sikkerhet eller levering av varer og
          tjenester som omsettes mellom brukere, eller for indirekte tap som måtte oppstå som følge
          av bruk av tjenesten. Begrensningen gjelder ikke rettigheter du har som forbruker etter
          ufravikelig lov.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">12. Personvern</h2>
        <p className="mt-3">
          Vår behandling av personopplysninger er beskrevet i{" "}
          <LegalDocLink to="/personvern" onOpen={onOpenPersonvern}>
            personvernerklæringen
          </LegalDocLink>
          .
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">13. Sletting av konto</h2>
        <p className="mt-3">
          Du kan be om sletting av kontoen din fra profilsiden. Du kan angre slettingen i 7 dager
          før dataene fjernes permanent. Enkelte opplysninger kan bli beholdt så lenge det er
          nødvendig for å oppfylle rettslige forpliktelser.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">14. Endringer i vilkårene</h2>
        <p className="mt-3">
          Kaupet kan oppdatere disse vilkårene. Vesentlige endringer varsles på e-post eller i appen
          minst 30 dager før de trer i kraft. Godtar du ikke endringene, kan du slette kontoen før
          de trer i kraft. Fortsetter du å bruke tjenesten etter dette, gjelder de nye vilkårene.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">15. Lovvalg og tvister</h2>
        <p className="mt-3">
          Vilkårene reguleres av norsk rett. Tvister søkes løst i minnelighet. Som forbruker kan du
          få hjelp og mekling fra{" "}
          <a
            href="https://www.forbrukerradet.no"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Forbrukerrådet
          </a>
          , og du kan alltid bringe en tvist inn for domstolen der du bor.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">16. Kontakt</h2>
        <p className="mt-3">
          Kaupet.no forvaltes av <strong>Happy Pixel AS</strong>, organisasjonsnummer{" "}
          <strong>933 197 867</strong>. Spørsmål om vilkårene kan rettes til <KontaktEpost />.
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
            <strong>Tjenesteleverandør:</strong> Happy Pixel AS, organisasjonsnummer 933 197 867,
            e-post <KontaktEpost />.
          </li>
          <li>
            <strong>Tjenesten:</strong> Én navngitt annonse vises i en egen «Fremhevet»-seksjon
            øverst i relevante søk og kategorisider. Inntil to fremhevede annonser vises om gangen —
            om flere annonser har aktiv fremheving, velges to tilfeldig per visning. Tjenesten gis
            for valgt antall dager (3 eller 5).
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
            <strong>Levering:</strong> Fremhevingen aktiveres så snart Kaupet mottar bekreftet
            betaling, og varer i valgt antall dager fra aktiveringstidspunktet.
          </li>
          <li>
            <strong>Angrerett:</strong> Tjenesten er digitalt innhold som leveres umiddelbart. Du må
            samtykke i kjøpsdialogen til at leveringen starter med en gang og at angreretten dermed
            bortfaller, jf. angrerettloven § 22 bokstav n.
          </li>
          <li>
            <strong>Avbrutt levering:</strong> Hvis fremhevingen ikke kan leveres på grunn av
            teknisk feil hos oss, eller fordi annonsen fjernes av Kaupet uten brukerens skyld, kan
            du kontakte support for refusjon av den ubrukte delen av perioden. Hvis du selv setter
            annonsen til solgt, deaktiverer eller sletter den i fremhevingsperioden, refunderes ikke
            kjøpet.
          </li>
          <li>
            <strong>Reklamasjon og kontakt:</strong> Henvendelser om kjøpet rettes til{" "}
            <KontaktEpost />.
          </li>
        </ul>
      </section>
    </div>
  );
}
