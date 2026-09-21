import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Historikkgraf for annonseinnsikt — eneste fil som importerer recharts for
 * bedriftskonsollen, se lazy-import i business-console.tsx. */
export type BusinessConsoleChartPoint = {
  date: string;
  label: string;
  value: number;
};

export function BusinessConsoleChart({
  data,
  seriesLabel,
}: {
  data: BusinessConsoleChartPoint[];
  seriesLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
        <CartesianGrid vertical={false} className="stroke-border" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            color: "var(--foreground)",
          }}
          formatter={(value) => [value, seriesLabel]}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={seriesLabel}
          stroke="var(--primary)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
