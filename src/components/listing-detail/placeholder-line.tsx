/** Grå strek i stedet for et felt som ikke er fylt ut ennå — kun i
 * forhåndsvisningen i annonseflytene. */
export function PlaceholderLine({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`block h-2.5 rounded-full bg-foreground/10 ${className ?? ""}`} />
  );
}
