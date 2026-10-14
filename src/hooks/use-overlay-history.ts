import { useEffect, useRef, useState } from "react";

/**
 * Gir et åpent overlay sin egen historikk-oppføring, slik at Android-
 * tilbakeknappen og iOS' kantsveip lukker overlayet i stedet for å navigere
 * siden bak det.
 *
 * Mønsteret sto opprinnelig lokalt i `image-lightbox.tsx` og `map-overlay.tsx`;
 * det bor her nå fordi det er en egenskap ved overlay-primitivene, ikke ved
 * kallstedet.
 *
 * Kalles fra `FullscreenOverlay` og `ResponsiveOverlay`. `enabled` finnes for
 * flater som med vilje ikke skal kunne lukkes med tilbake (onboarding).
 */

// Én historikk-oppføring per åpent overlay-nivå, i en stack på modulnivå:
// tilbake lukker bare øverste nivå, så et nøstet valgark lukkes uten at
// filterpanelet bak forsvinner. Én felles popstate-lytter avgjør hvem som
// lukkes; per-hook-lyttere ville latt flere nivåer reagere på samme pop.
//
// Modulnivå, ikke per komponent: et lazy-lastet overlay (`ImageLightbox` bak
// `Suspense`) monteres og remonteres rundt at chunken løses, og en push/back
// per montering ville lagt igjen en ekstra oppføring brukeren måtte trykke
// tilbake to ganger for å komme forbi. Målt i dev. Derfor overtar en
// montering øverste nivå hvis det er på vei til å ryddes.
type Entry = {
  close: () => void;
  popped: boolean;
  /** Render-rekkefølge: en forelder rendres før overlayene den inneholder. */
  order: number;
  /** Avmontert, ryddes ved neste `flushReleases` med mindre en montering
   * overtar den først. */
  releasing: boolean;
};
const stack: Entry[] = [];
let renderSeq = 0;
// Nivåer lagt til i samme effektrunde (samme commit). React kjører barnets
// effekt før forelderens, så åpnes forelder og barn samtidig, sorteres de
// etter render-rekkefølge i stedet for effektrekkefølge.
let batch: Entry[] | null = null;

function insert(entry: Entry) {
  if (!batch) {
    batch = [];
    queueMicrotask(() => {
      batch = null;
    });
  }
  let index = stack.length;
  while (index > 0 && batch.includes(stack[index - 1]) && stack[index - 1].order > entry.order)
    index--;
  stack.splice(index, 0, entry);
  batch.push(entry);
}
// Hver oppføring bærer sitt nivå (`overlayLevel`). popstate lukker nivåene
// over det nivået man landet på, så egen opprydding (som lander på
// `stack.length`) lukker ingenting, og en traversering som aldri fullføres
// (avbrutt av en ruteendring) etterlater ingen teller som sluker neste trykk.
let listening = false;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

function levelOf(state: unknown): number {
  const level = (state as { overlayLevel?: unknown } | null)?.overlayLevel;
  return typeof level === "number" ? level : 0;
}

function onPop(event: PopStateEvent) {
  const level = levelOf(event.state);
  while (stack.length > level) {
    const top = stack.pop()!;
    top.releasing = false;
    top.popped = true;
    top.close();
  }
}

/** Rydder alle nivåer som ble avmontert, og går tilbake forbi oppføringene
 * deres i samme tick. Én felles timer: flere nivåer som lukkes samtidig gir
 * én traversering, og ingen montering kan komme mellom fjerning og
 * traversering og etterlate en død oppføring. */
function scheduleRelease() {
  if (releaseTimer !== undefined) return;
  releaseTimer = setTimeout(() => {
    releaseTimer = undefined;
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].releasing) stack.splice(i, 1);
    const excess = levelOf(history.state) - stack.length;
    if (excess > 0) history.go(-excess);
  }, 0);
}

export function useOverlayHistory(enabled: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const [order] = useState(() => ++renderSeq);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    if (!listening) {
      window.addEventListener("popstate", onPop);
      listening = true;
    }

    let entry = stack.at(-1);
    if (entry?.releasing) {
      // En avmontering er på vei til å rydde oppføringen — overta den i stedet.
      entry.releasing = false;
    } else {
      entry = { close: () => {}, popped: false, order, releasing: false };
      insert(entry);
      history.pushState({ overlay: true, overlayLevel: stack.length }, "");
    }
    const current = entry;
    current.close = () => onCloseRef.current();

    return () => {
      if (current.popped) return;
      // Lukket på annen måte (X, Escape, klikk utenfor): rydd opp oppføringen.
      // Utsatt én tick slik at en umiddelbar remontering overtar den i stedet.
      // scheduleRelease går bare tilbake over egne nivåer: ble overlayet
      // avmontert av en ruteendring, er toppen av stacken ruterens tilstand
      // (nivå 0), ikke vår.
      current.releasing = true;
      scheduleRelease();
    };
  }, [enabled, order]);
}
