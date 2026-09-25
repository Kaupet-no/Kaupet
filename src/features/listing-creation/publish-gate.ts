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
