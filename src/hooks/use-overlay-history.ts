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
  releaseTimer?: ReturnType<typeof setTimeout>;
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
let syncTimer: ReturnType<typeof setTimeout> | undefined;

function levelOf(state: unknown): number {
  const level = (state as { overlayLevel?: unknown } | null)?.overlayLevel;
  return typeof level === "number" ? level : 0;
}

function onPop(event: PopStateEvent) {
  const level = levelOf(event.state);
  while (stack.length > level) {
    const top = stack.pop()!;
    clearTimeout(top.releaseTimer);
    top.popped = true;
    top.close();
  }
}

/** Gå tilbake forbi oppføringer for nivåer som er ryddet. Samles til ett
 * kall per tick, så flere nivåer som lukkes samtidig gir én traversering. */
function scheduleSync() {
  if (syncTimer !== undefined) return;
  syncTimer = setTimeout(() => {
    syncTimer = undefined;
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
    if (entry?.releaseTimer !== undefined) {
      // En avmontering er på vei til å rydde oppføringen — overta den i stedet.
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = undefined;
    } else {
      entry = { close: () => {}, popped: false, order };
      insert(entry);
      history.pushState({ overlay: true, overlayLevel: stack.length }, "");
    }
    const current = entry;
    current.close = () => onCloseRef.current();

    return () => {
      if (current.popped) return;
      // Lukket på annen måte (X, Escape, klikk utenfor): rydd opp oppføringen.
      // Utsatt én tick slik at en umiddelbar remontering overtar den i stedet.
      // scheduleSync går bare tilbake over egne nivåer: ble overlayet
      // avmontert av en ruteendring, er toppen av stacken ruterens tilstand
      // (nivå 0), ikke vår.
      current.releaseTimer = setTimeout(() => {
        current.releaseTimer = undefined;
        const index = stack.indexOf(current);
        if (index >= 0) stack.splice(index, 1);
        scheduleSync();
      }, 0);
    };
  }, [enabled, order]);
}
