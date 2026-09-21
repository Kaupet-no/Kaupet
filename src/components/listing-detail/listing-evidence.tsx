export function SellerNoKnownIssues() {
  return (
    <div
      role="note"
      aria-label="Selgeropplysning"
      className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2.5"
    >
      <p className="text-xs font-medium text-muted-foreground">Oppgitt av selger</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground/90">
        Selger har oppgitt at kjøretøyet ikke har kjente feil eller mangler.
      </p>
    </div>
  );
}
