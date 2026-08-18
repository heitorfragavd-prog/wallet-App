import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  type VisualizationContract,
  visualizationContractSchema,
} from "../types/visualization";

const COLORS = ["#10b981", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

function formatValue(value: unknown, format?: "currency" | "number" | "percent"): string {
  const num = Number(value);
  if (isNaN(num)) return String(value ?? "");

  if (format === "currency") {
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (format === "percent") {
    return `${(num * 100).toFixed(1)}%`;
  }
  return num.toLocaleString("pt-BR");
}

export interface AgentVisualizationRendererProps {
  contract: unknown;
}

export const AgentVisualizationRenderer: React.FC<AgentVisualizationRendererProps> = ({
  contract,
}) => {
  const parsed = visualizationContractSchema.safeParse(contract);

  if (!parsed.success) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
        <p className="font-semibold">Visualização indisponível</p>
        <p>O contrato de dados retornado não atende ao padrão esperado.</p>
      </div>
    );
  }

  const viz: VisualizationContract = parsed.data;

  if (!viz.data || viz.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
        <p className="font-medium text-sm">{viz.title}</p>
        <p className="text-xs">Nenhum dado encontrado para o período especificado.</p>
      </div>
    );
  }

  const xAxisKey = viz.xAxis?.key ?? "name";

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h4 className="font-semibold text-foreground text-sm">{viz.title}</h4>
        {viz.description && (
          <p className="text-muted-foreground text-xs">{viz.description}</p>
        )}
      </div>

      {/* KPI Cards */}
      {viz.type === "kpi" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {viz.data.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border bg-background/50 p-3 shadow-none"
            >
              <p className="text-muted-foreground text-xs">
                {String(item.label ?? item.title ?? `Métrica ${idx + 1}`)}
              </p>
              <p className="font-bold text-foreground text-lg">
                {formatValue(item.value, viz.series[0]?.format ?? "currency")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {viz.type === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/50 text-muted-foreground">
              <tr>
                {Object.keys(viz.data[0] || {}).map((col) => (
                  <th key={col} className="px-3 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {viz.data.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/30">
                  {Object.entries(row).map(([col, val], cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-foreground">
                      {typeof val === "number" ? formatValue(val, "currency") : String(val ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Line Chart */}
      {viz.type === "line" && (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={viz.data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, viz.yAxis?.format)}
              />
              <Tooltip
                formatter={(v, name) => [formatValue(v, viz.yAxis?.format), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {viz.series.map((s, idx) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color || COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bar Chart */}
      {viz.type === "bar" && (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={viz.data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, viz.yAxis?.format)}
              />
              <Tooltip
                formatter={(v, name) => [formatValue(v, viz.yAxis?.format), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {viz.series.map((s, idx) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color || COLORS[idx % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Area Chart */}
      {viz.type === "area" && (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={viz.data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, viz.yAxis?.format)}
              />
              <Tooltip
                formatter={(v, name) => [formatValue(v, viz.yAxis?.format), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {viz.series.map((s, idx) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color || COLORS[idx % COLORS.length]}
                  stroke={s.color || COLORS[idx % COLORS.length]}
                  fillOpacity={0.2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie Chart */}
      {viz.type === "pie" && (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(v, name) => [formatValue(v, "currency"), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Pie
                data={viz.data}
                dataKey={viz.series[0]?.key || "value"}
                nameKey={xAxisKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={(entry) => String(entry.name || "")}
              >
                {viz.data.map((_, idx) => (
                  <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights e Fontes */}
      {(viz.insight || (viz.source && viz.source.length > 0)) && (
        <div className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
          {viz.insight && <p className="font-medium">💡 {viz.insight}</p>}
          {viz.source && viz.source.length > 0 && (
            <p className="mt-1">Fontes: {viz.source.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
};
