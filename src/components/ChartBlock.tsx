import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartSpec {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

const CHART_COLORS = [
  "hsl(199, 89%, 48%)",
  "hsl(173, 80%, 40%)",
  "hsl(43, 96%, 56%)",
  "hsl(262, 83%, 58%)",
  "hsl(330, 81%, 60%)",
];

function transformForLineBar(spec: ChartSpec): Array<Record<string, string | number>> {
  return spec.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    for (const ds of spec.datasets) {
      point[ds.label] = ds.data[i] ?? 0;
    }
    return point;
  });
}

function transformForPie(spec: ChartSpec): Array<{ name: string; value: number }> {
  return spec.labels.map((label, i) => ({
    name: label,
    value: spec.datasets[0]?.data[i] ?? 0,
  }));
}

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  if (spec.type === "line") {
    const data = transformForLineBar(spec);
    return (
      <div className="my-4 h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 90%)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {spec.datasets.map((ds, i) => (
              <Line
                key={ds.label}
                type="monotone"
                dataKey={ds.label}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === "bar") {
    const data = transformForLineBar(spec);
    return (
      <div className="my-4 h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(215, 20%, 90%)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {spec.datasets.map((ds, i) => (
              <Bar key={ds.label} dataKey={ds.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (spec.type === "pie") {
    const data = transformForPie(spec);

    return (
      <div className="my-4 h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            >
              {data.map((entry, i) => (
                <Cell
                  key={`${entry.name}-${entry.value}`}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}
