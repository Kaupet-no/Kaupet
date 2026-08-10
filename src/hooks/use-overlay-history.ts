import { useEffect, useRef } from "react";

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

// Telles på modulnivå, ikke per komponent: et lazy-lastet overlay
// (`ImageLightbox` bak `Suspense`) monteres og remonteres rundt at chunken
// løses, og en push/back per montering ville lagt igjen en ekstra oppføring
// brukeren måtte trykke tilbake to ganger for å komme forbi. Målt i dev.
// ponytail: én delt oppføring for alle åpne overlays — tilbake lukker da et
// nøstet overlay og forelderen samtidig. Tell per nivå hvis nøsting blir vanlig.
let openOverlays = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

export function useOverlayHistory(enabled: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    let popped = false;

    if (releaseTimer !== undefined) {
      // En avmontering er på vei til å rydde oppføringen — overta den i stedet.
      clearTimeout(releaseTimer);
      releaseTimer = undefined;
    } else {
      if (openOverlays === 0) history.pushState({ overlay: true }, "");
      openOverlays++;
    }

    const onPop = () => {
      popped = true;
      openOverlays = 0;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (popped) return;
      // Lukket på annen måte (X, Escape, klikk utenfor): rydd opp oppføringen.
      // Utsatt én tick slik at en umiddelbar remontering overtar den i stedet.
      // Guarden hindrer at vi navigerer feil vei når overlayet i stedet ble
      // avmontert av en ruteendring — da er toppen av stacken ruterens
      // tilstand, ikke vår.
      releaseTimer = setTimeout(() => {
        releaseTimer = undefined;
        openOverlays--;
        if (openOverlays === 0 && (history.state as { overlay?: boolean } | null)?.overlay)
          history.back();
      }, 0);
    };
  }, [enabled]);
}
