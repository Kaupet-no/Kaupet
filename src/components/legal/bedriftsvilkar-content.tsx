import { KontaktEpost, LegalDocLink } from "@/components/legal/vilkar-content";

export function BedriftsvilkarContent({
  onOpenPersonvern,
  onOpenVilkar,
}: {
  onOpenPersonvern?: () => void;
  onOpenVilkar?: () => void;
}) {
  return (
    <div className="space-y-10 text-sm leading-relaxed text-foreground/90">
      <section>
        <p className="text-muted-foreground">Sist oppdatert 4. oktober 2026</p>
        <p className="mt-3">
          Disse vilkårene gjelder for virksomheter som bruker Kaupet.no med bedriftskonto, og for
          personer som bruker tjenesten på vegne av en slik virksomhet. Avtalen inngås mellom Happy
          Pixel AS og virksomheten. For medlemmenes egen, private bruk av Kaupet gjelder{" "}
          <LegalDocLink to="/vilkar" onOpen={onOpenVilkar}>
            brukervilkårene for privatpersoner
          </LegalDocLink>
          .
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">1. Om Kaupet.no</h2>
        <p className="mt-3">
          Kaupet.no er en norsk annonsetjeneste der privatpersoner og bedrifter legger ut annonser
          for varer de selv selger. Kaupet selger ingen varer selv. Vi formidler kontakt mellom
          kjøper og selger, og handelen skjer direkte mellom dem. Kaupet er{" "}
          <strong>ikke part</strong> i avtalen som inngås mellom bedriften og kjøperen. Vi tilbyr
          ikke betalingsformidling, frakttjenester eller garanti for handler som gjennomføres via
          tjenesten.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">2. Bedriftskonto og fullmakt</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>
            Bedriftskontoen opprettes på vegne av virksomheten som er identifisert med
            organisasjonsnummer i Enhetsregisteret.
          </li>
          <li>
            Personen som oppretter kontoen må være minst 18 år og bekrefter å ha fullmakt til å
            inngå avtale på vegne av virksomheten.
          </li>
          <li>
            Virksomheten er ansvarlig for at opplysningene som oppgis, herunder faktura-e-post, er
            korrekte og holdes oppdatert.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">3. Medlemmer og tilgang</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>
            Hvert medlem logger inn med sin egen personlige konto. Innloggingsinformasjon skal ikke
            deles.
          </li>
          <li>
            Superbrukere inviterer og fjerner medlemmer og bestemmer hvilke lokasjoner, annonser og
            meldinger hvert medlem har tilgang til. Virksomheten skal fjerne tilgangen når et medlem
            ikke lenger skal handle på dens vegne.
          </li>
          <li>Virksomheten er ansvarlig for alt medlemmene gjør på dens vegne.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">4. Akseptabel bruk</h2>
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
          <li>Å legge ut bedriftens varer som privatannonser.</li>
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
        <h2 className="font-display text-2xl">5. Annonseregler</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>
            Annonsen skal gjelde en reell vare som bedriften har rett til å selge og kan levere.
            Annonser for varer som er solgt eller utgått, skal fjernes eller settes til solgt.
          </li>
          <li>
            Velg riktig kategori og oppgi totalpris i norske kroner, inkludert merverdiavgift og
            andre obligatoriske kostnader.
          </li>
          <li>Bruk egne bilder eller bilder bedriften har rett til å bruke.</li>
          <li>
            Ikke legg inn kontaktinformasjon eller eksterne lenker i tittel eller bilder. Bruk i
            stedet feltene Kaupet tilbyr, som kontaktpersoner og nettsidelenke.
          </li>
          <li>Ikke publiser duplikater av samme annonse.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">6. Salg til forbrukere</h2>
        <p className="mt-3">
          Bedriften er selger og har ansvaret for å oppfylle gjeldende lovgivning overfor kjøperen,
          herunder forbrukerkjøpsloven, angrerettloven, markedsføringsloven og regler om
          prisopplysning. Det innebærer blant annet å gi forbrukeren de opplysningene loven krever
          før kjøpet, å respektere angrerett ved salg på avstand og å behandle reklamasjoner. Kaupet
          er ikke ansvarlig for bedriftens oppfyllelse av disse pliktene.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">7. Meldinger og vurderinger</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>
            Meldinger skal være saklige og relatert til handel på Kaupet. Meldinger fra kjøpere skal
            ikke brukes til markedsføring uten samtykke.
          </li>
          <li>Vurderinger skal være ærlige og basert på en reell handel mellom partene.</li>
          <li>Falske, manipulerende eller hevnmotiverte vurderinger vil bli fjernet.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">8. Import og API</h2>
        <ul className="mt-3 space-y-2 list-disc pl-5">
          <li>
            Annonser som importeres fra fil, API eller andre integrasjoner, omfattes av de samme
            reglene som annonser som opprettes manuelt.
          </li>
          <li>
            API-nøkler er hemmelige. Virksomheten er ansvarlig for all bruk av nøklene sine og skal
            slette en nøkkel som kan ha kommet på avveie.
          </li>
          <li>
            Integrasjoner er underlagt grensene som vises i bedriftskonsollen. Kaupet kan sperre
            nøkler og integrasjoner som brukes i strid med vilkårene eller belaster tjenesten
            unormalt.
          </li>
        </ul>
      </section>

      <section id="proff" className="scroll-mt-24">
        <h2 className="font-display text-2xl">9. Planer, priser og betaling</h2>
        <p className="mt-3">
          Bedriftskontoer kan velge «Proff basis» eller «Proff». Proff basis er gratis. Proff er et
          løpende abonnement som bestilles med månedlig eller årlig fakturering. Første bestilling
          gir én ikke-fornybar prøveperiode på 30 dager med umiddelbar tilgang.
        </p>
        <p className="mt-3">
          Første faktura sendes i god tid før prøveperioden utløper, med forfall den dagen
          prøveperioden utløper. Når fakturaen er betalt, fortsetter Proff uten avbrudd for den
          valgte perioden. Blir fakturaen ikke betalt ved forfall, opphører Proff-avtalen når
          prøveperioden er over. Bedriften kan avslutte prøveperioden i bedriftskonsollen når som
          helst før den utløper. Bestillingen kanselleres da, og en faktura som allerede er sendt,
          krediteres.
        </p>
        <p className="mt-3">
          Proff koster 1 490 kr per måned eks. mva, eller 16 092 kr per år eks. mva ved
          årsabonnement (12 måneder med 10 % rabatt). Hver lokasjon utover den første koster 249 kr
          per måned eks. mva, og faktureres fra neste faktureringsperiode etter at lokasjonen er
          opprettet. Merverdiavgift kommer i tillegg etter gjeldende sats. Abonnementet faktureres
          forskuddsvis for hver periode. Fakturaen sendes minst 14 dager før forfall, og forfall er
          første dag i perioden fakturaen gjelder.
        </p>
        <p className="mt-3">
          Abonnementet fornyes med en ny periode av samme lengde til det sies opp. Hver fakturert
          periode er bindende, men abonnementet har ingen bindingstid utover dette. Ved oppsigelse
          løper Proff ut den betalte perioden, og påbegynte perioder refunderes ikke. Blir en
          faktura ikke betalt ved forfall, kan det sendes betalingspåminnelse, og Proff-avtalen
          opphører når den betalte perioden er utløpt. Når Proff opphører, blir Proff-funksjoner som
          branding, nettsidelenke og ekstra brukere deaktivert. Lagrede bedrifts-, medlems- og
          profileringsopplysninger slettes ikke av den grunn. Prisendringer varsles minst 30 dager
          før de får virkning for en ny faktureringsperiode.
        </p>
        <p className="mt-3">
          Funksjoner som er merket «Kommer senere» i planoversikten, er ikke en del av det som
          leveres før de er lansert.
        </p>
      </section>

      <section id="kjopsvilkar" className="scroll-mt-24">
        <h2 className="font-display text-2xl">10. Fremhevet annonse</h2>
        <p className="mt-3">
          Bedriften kan kjøpe «fremhevet annonse». Én navngitt annonse vises da i en egen
          «Fremhevet»-seksjon øverst i relevante søk og kategorisider i valgt antall dager (3 eller
          5). Inntil to fremhevede annonser vises om gangen — om flere annonser har aktiv
          fremheving, velges to tilfeldig per visning. Pris vises i kjøpsdialogen, og betalingen
          belastes umiddelbart. Fremhevingen aktiveres når betalingen er bekreftet.
        </p>
        <p className="mt-3">
          Kjøpet er et kjøp mellom næringsdrivende, og angrerettloven gjelder ikke. Kan fremhevingen
          ikke leveres på grunn av teknisk feil hos oss, eller fordi annonsen fjernes av Kaupet uten
          bedriftens skyld, refunderes den ubrukte delen av perioden. Settes annonsen til solgt,
          deaktiveres eller slettes den i perioden, refunderes ikke kjøpet.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">11. Innhold og profilering</h2>
        <p className="mt-3">
          Virksomheten beholder rettighetene til innholdet den publiserer, herunder annonser,
          bilder, logo og profilering. Virksomheten gir Kaupet en vederlagsfri, ikke-eksklusiv
          lisens til å lagre, tilpasse og vise innholdet så lenge det er nødvendig for å levere
          tjenesten, inkludert statistikk over solgte annonser. Innholdet må ikke krenke tredjeparts
          rettigheter.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">12. Moderering, sanksjoner og klage</h2>
        <p className="mt-3">
          Kaupet kan fjerne annonser og meldinger, skjule innhold, sperre integrasjoner, midlertidig
          suspendere eller permanent stenge bedriftskontoer og medlemmer ved brudd på vilkårene. Ved
          alvorlige eller gjentatte brudd kan dette skje uten forhåndsvarsel. Moderasjonshandlinger
          logges internt. Virksomheten får en begrunnelse for avgjørelsen og kan klage til{" "}
          <KontaktEpost />.
        </p>
        <p className="mt-3">
          Brukere kan rapportere annonser, meldinger og profiler som bryter vilkårene.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">13. Tilgjengelighet</h2>
        <p className="mt-3">
          Kaupet garanterer ikke uavbrutt drift og kan endre funksjoner i tjenesten. Vesentlige
          innskrenkninger i betalte funksjoner varsles i rimelig tid, og betalt periode som ikke kan
          leveres, refunderes forholdsmessig.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">14. Ansvarsbegrensning</h2>
        <p className="mt-3">
          Kaupet er ikke ansvarlig for kvalitet, lovlighet, sikkerhet eller levering av varer som
          omsettes via tjenesten, eller for indirekte tap som tapt fortjeneste og tapte data.
          Kaupets samlede ansvar overfor virksomheten er begrenset til vederlaget virksomheten har
          betalt de siste 12 månedene. Begrensningene gjelder ikke ved forsett eller grov
          uaktsomhet.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">15. Personvern</h2>
        <p className="mt-3">
          Vår behandling av personopplysninger er beskrevet i{" "}
          <LegalDocLink to="/personvern" onOpen={onOpenPersonvern}>
            personvernerklæringen
          </LegalDocLink>
          . Legger virksomheten inn opplysninger om andre personer, for eksempel kontaktpersoner med
          navn, telefonnummer og bilde, er virksomheten ansvarlig for å ha grunnlag for dette og for
          å informere dem.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">16. Avslutning</h2>
        <p className="mt-3">
          Virksomheten kan avslutte bedriftskontoen ved å kontakte <KontaktEpost />. Betalt periode
          refunderes ikke, og utestående fakturaer forfaller som normalt. Annonser som er publisert
          fra bedriftskontoen, fjernes når kontoen avsluttes. Kaupet kan avslutte bedriftskontoen
          ved vesentlig mislighold, eller dersom virksomheten er slettet fra Enhetsregisteret.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">17. Endringer i vilkårene</h2>
        <p className="mt-3">
          Kaupet kan oppdatere disse vilkårene. Vesentlige endringer varsles på e-post til
          bedriftens superbrukere minst 30 dager før de trer i kraft. Godtar virksomheten ikke
          endringene, kan den si opp abonnementet før de trer i kraft.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">18. Lovvalg og verneting</h2>
        <p className="mt-3">
          Vilkårene reguleres av norsk rett. Tvister søkes løst i minnelighet. Hvis dette ikke
          lykkes, er Oslo tingrett avtalt verneting.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">19. Kontakt</h2>
        <p className="mt-3">
          Kaupet.no forvaltes av <strong>Happy Pixel AS</strong>, organisasjonsnummer{" "}
          <strong>933 197 867</strong>. Spørsmål om vilkårene kan rettes til <KontaktEpost />.
        </p>
      </section>
    </div>
  );
}
