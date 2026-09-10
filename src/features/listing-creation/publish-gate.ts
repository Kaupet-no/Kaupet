/** What must happen when the composer's publish button is submitted.
 *
 * Extracted from ny-annonse.tsx so the *order* of the gates is testable
 * without mounting the whole wizard. The order matters: a signed-out guest
 * has to be sent to /auth before any dialog that can reach `mutation.mutate`,
 * otherwise the publish call fails server-side with "Du må være logget inn."
 */
export type PublishGate =
  "fill-required-attributes" | "sign-in" | "confirm-without-preview" | "publish";

export function publishGate(state: {
  hasMissingAttributes: boolean;
  authenticated: boolean;
  hasPreviewed: boolean;
  native: boolean;
}): PublishGate {
  if (state.hasMissingAttributes) return "fill-required-attributes";
  if (!state.authenticated) return "sign-in";
  if (!state.hasPreviewed && !state.native) return "confirm-without-preview";
  return "publish";
}
