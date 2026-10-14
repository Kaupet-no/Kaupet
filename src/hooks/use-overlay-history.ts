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
// history.back() fra egen opprydding gir også popstate; den skal ikke lukke
// nivået under.
let ignoredPops = 0;
let listening = false;

function onPop() {
  if (ignoredPops > 0) {
    ignoredPops--;
    return;
  }
  const top = stack.pop();
  if (!top) return;
  clearTimeout(top.releaseTimer);
  top.popped = true;
  top.close();
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
      // Guarden hindrer at vi navigerer feil vei når overlayet i stedet ble
      // avmontert av en ruteendring — da er toppen av stacken ruterens
      // tilstand, ikke vår.
      current.releaseTimer = setTimeout(() => {
        current.releaseTimer = undefined;
        const index = stack.indexOf(current);
        if (index >= 0) stack.splice(index, 1);
        if ((history.state as { overlay?: unknown } | null)?.overlay) {
          ignoredPops++;
          history.back();
        }
      }, 0);
    };
  }, [enabled, order]);
}
