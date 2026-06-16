import { AlertTriangle } from "lucide-react";

export function TestEnvBanner() {
  return (
    <div className="w-full bg-yellow-400 text-yellow-950 border-b border-yellow-500">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-xs font-medium sm:text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          <strong>TESTMILJØ</strong> — Data og betalinger er ikke ekte. Brukes kun for testing av ny
          funksjonalitet.
        </span>
      </div>
    </div>
  );
}
