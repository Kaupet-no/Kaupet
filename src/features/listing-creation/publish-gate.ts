/** What must happen when the composer's publish button is submitted.
 *
 * Extracted from ny-annonse.tsx so the *order* of the gates is testable
 * without mounting the whole wizard. The order matters: a signed-out guest
 * has to be sent to /auth before anything can reach `mutation.mutate`,
 * otherwise the publish call fails server-side with "Du må være logget inn."
 */
export type PublishGate = "fill-required-attributes" | "sign-in" | "publish";

export function publishGate(state: {
  hasMissingAttributes: boolean;
  authenticated: boolean;
}): PublishGate {
  if (state.hasMissingAttributes) return "fill-required-attributes";
  if (!state.authenticated) return "sign-in";
  return "publish";
}

/**
 * Hindrer at Enter i et tekstfelt sender inn skjemaet (implisitt innsending).
 * Hele veiviseren er ett <form>, og på Se over ligger annonsens innebygde
 * redigeringsfelt og Publiser-knappen i samme skjema — uten denne sperren
 * publiserte Enter i f.eks. tittelfeltet annonsen. Kun et eksplisitt trykk på
 * Publiser skal sende inn.
 */
export function blockImplicitSubmit(e: {
  key: string;
  target: EventTarget | null;
  preventDefault: () => void;
}) {
  if (
    e.key === "Enter" &&
    e.target instanceof HTMLInputElement &&
    e.target.type !== "submit" &&
    e.target.type !== "image"
  )
    e.preventDefault();
}
