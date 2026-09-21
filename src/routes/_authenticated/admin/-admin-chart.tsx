import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Graf for daglige visninger — eneste fil som importerer recharts for
 * admin-dashbordet, se lazy-import i index.tsx. */
export type AdminViewsChartPoint = {
  day: string;
  views: number;
  label: string;
};

export function AdminViewsChart({ data }: { data: AdminViewsChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={288}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="label" className="text-xs" />
        <YAxis className="text-xs" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
          }}
        />
        <Line
          type="monotone"
          dataKey="views"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
