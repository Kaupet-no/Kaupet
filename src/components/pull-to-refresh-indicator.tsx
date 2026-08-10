/**
 * Spinneren over `usePullToRefresh`. Trukket ut av `annonser.tsx` da gesten
 * ble tatt i bruk på flere ruter (fase 7, tiltak 18) — markupen var i ferd med
 * å bli kopiert fem steder.
 */
export function PullToRefreshIndicator({
  pullDistance,
  refreshing,
  threshold = 64,
}: {
  pullDistance: number;
  refreshing: boolean;
  threshold?: number;
}) {
  if (pullDistance <= 0 && !refreshing) return null;
  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-150"
      style={{ height: refreshing ? 48 : Math.min(pullDistance, 48) }}
    >
      <div
        className={`size-6 rounded-full border-2 border-primary border-t-transparent ${refreshing ? "animate-spin" : ""}`}
        style={{ opacity: refreshing ? 1 : pullDistance / threshold }}
      />
    </div>
  );
}
