import { useMemo, useState } from "react";

import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TERM_YEARS_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

function formatKr(value: number) {
  return `${Math.round(value).toLocaleString("nb-NO")} kr`;
}

/**
 * Veiledende lånekalkulator for kjøretøy-annonser, vist rett under
 * "Vis teknisk informasjon"-seksjonen. Bruker en enkel annuitetsformel —
 * effektiv rente behandles her som en nominell årsrente kompondert månedlig,
 * god nok for et anslag men ikke en bindende lånekalkyle.
 */
export function LoanCalculator({ totalPriceKr }: { totalPriceKr: number | null }) {
  const total = totalPriceKr != null && totalPriceKr > 0 ? totalPriceKr : null;

  const [downPaymentKr, setDownPaymentKr] = useState(() => Math.round((total ?? 0) * 0.2));
  const [interestRatePct, setInterestRatePct] = useState(7);
  const [termYears, setTermYears] = useState(5);

  const clampedDownPayment = total != null ? Math.min(Math.max(downPaymentKr, 0), total) : 0;
  const loanAmountKr = total != null ? total - clampedDownPayment : 0;

  const { monthlyPaymentKr, totalCostKr, totalInterestKr } = useMemo(() => {
    if (loanAmountKr <= 0) return { monthlyPaymentKr: 0, totalCostKr: 0, totalInterestKr: 0 };

    const r = interestRatePct / 100 / 12;
    const n = termYears * 12;
    const monthly = r === 0 ? loanAmountKr / n : (loanAmountKr * r) / (1 - Math.pow(1 + r, -n));
    const totalPaid = monthly * n;

    return {
      monthlyPaymentKr: monthly,
      totalCostKr: totalPaid + clampedDownPayment,
      totalInterestKr: totalPaid - loanAmountKr,
    };
  }, [loanAmountKr, interestRatePct, termYears, clampedDownPayment]);

  if (total == null) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <h3 className="font-display text-base">Lånekalkulator</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Veiledende beregning basert på totalpris {formatKr(total)}. Ikke et bindende lånetilbud.
      </p>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Egenkapital: {formatKr(clampedDownPayment)}</span>
          <span className="text-muted-foreground">Lånebeløp: {formatKr(loanAmountKr)}</span>
        </div>
        <Slider
          value={[clampedDownPayment]}
          onValueChange={([v]) => setDownPaymentKr(v)}
          min={0}
          max={total}
          step={1000}
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <span className="text-sm text-muted-foreground">
          Effektiv rente: {interestRatePct.toLocaleString("nb-NO", { minimumFractionDigits: 1 })} %
        </span>
        <Slider
          value={[interestRatePct]}
          onValueChange={([v]) => setInterestRatePct(v)}
          min={0}
          max={15}
          step={0.1}
        />
      </div>

      <div className="mt-4">
        <span className="text-sm text-muted-foreground">Nedbetalingstid</span>
        <Select value={String(termYears)} onValueChange={(v) => setTermYears(Number(v))}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERM_YEARS_OPTIONS.map((years) => (
              <SelectItem key={years} value={String(years)}>
                {years} {years === 1 ? "år" : "år"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="font-display text-xl text-primary">{formatKr(monthlyPaymentKr)} / mnd</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Totalkostnad over {termYears} {termYears === 1 ? "år" : "år"}: {formatKr(totalCostKr)}{" "}
          (hvorav {formatKr(totalInterestKr)} i renter)
        </p>
      </div>
    </div>
  );
}
