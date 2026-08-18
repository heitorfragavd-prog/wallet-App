import { z } from "zod";

export const visualizationSeriesSchema = z.object({
  key: z.string(),
  label: z.string(),
  color: z.string().optional().default("#3b82f6"),
  format: z.enum(["currency", "number", "percent"]).optional().default("currency"),
});

export const visualizationContractSchema = z.object({
  type: z.enum(["line", "bar", "area", "pie", "composed", "kpi", "table"]),
  title: z.string(),
  description: z.string().optional().default(""),
  xAxis: z
    .object({
      key: z.string(),
      label: z.string().optional(),
    })
    .optional(),
  yAxis: z
    .object({
      label: z.string().optional(),
      format: z.enum(["currency", "number", "percent"]).optional().default("currency"),
    })
    .optional(),
  series: z.array(visualizationSeriesSchema).default([]),
  data: z.array(z.record(z.unknown())).default([]),
  insight: z.string().optional().default(""),
  source: z.array(z.string()).optional().default([]),
  period: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  filters: z.array(z.string()).optional().default([]),
});

export type VisualizationSeries = z.infer<typeof visualizationSeriesSchema>;
export type VisualizationContract = z.infer<typeof visualizationContractSchema>;
