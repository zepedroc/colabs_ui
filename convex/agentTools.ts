/**
 * Agent tools for math evaluation and chart creation.
 * Used by the AI council when toolsEnabled is true.
 */

import { evaluate } from "mathjs";

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "evaluate_math",
      description:
        "Evaluate a math expression. Supports +, -, *, /, ^, sqrt, sin, cos, log, etc. Returns the numeric result. Use when the user asks for calculations or math.",
      parameters: {
        type: "object" as const,
        properties: {
          expression: { type: "string" as const, description: "The math expression to evaluate" },
        },
        required: ["expression"] as const,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_chart",
      description:
        "Create a chart or graph. Use when the user asks for a visualization, graph, or chart. Provide type (line, bar, or pie), labels for x-axis/categories, and datasets with label and data array.",
      parameters: {
        type: "object" as const,
        properties: {
          type: {
            type: "string" as const,
            enum: ["line", "bar", "pie"],
            description: "Chart type",
          },
          labels: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Labels for x-axis or category names",
          },
          datasets: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                label: { type: "string" as const, description: "Dataset label" },
                data: {
                  type: "array" as const,
                  items: { type: "number" as const },
                  description: "Numeric values",
                },
              },
              required: ["label", "data"],
            },
            description: "One or more datasets with label and data array",
          },
        },
        required: ["type", "labels", "datasets"] as const,
      },
    },
  },
];

export interface ChartSpec {
  type: "line" | "bar" | "pie";
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

function isChartSpec(obj: unknown): obj is ChartSpec {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (o.type !== "line" && o.type !== "bar" && o.type !== "pie") return false;
  if (!Array.isArray(o.labels) || !o.labels.every((l) => typeof l === "string")) return false;
  if (!Array.isArray(o.datasets)) return false;
  for (const ds of o.datasets) {
    if (!ds || typeof ds !== "object") return false;
    const d = ds as Record<string, unknown>;
    if (typeof d.label !== "string") return false;
    if (!Array.isArray(d.data) || !d.data.every((n) => typeof n === "number")) return false;
  }
  return true;
}

export interface ToolResult {
  content: string;
  chartSpec?: ChartSpec | null;
}

export function executeTool(name: string, args: Record<string, unknown>): ToolResult {
  if (name === "evaluate_math") {
    const expression = args.expression;
    if (typeof expression !== "string" || !expression.trim()) {
      return { content: "Error: expression must be a non-empty string" };
    }
    try {
      const result = evaluate(expression);
      return { content: String(result) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: `Error: ${msg}` };
    }
  }

  if (name === "create_chart") {
    const spec = {
      type: args.type,
      labels: args.labels,
      datasets: args.datasets,
    };
    if (!isChartSpec(spec)) {
      return {
        content:
          "Error: Invalid chart spec. Need type (line|bar|pie), labels (string[]), datasets ([{label, data}])",
      };
    }
    return { content: "Chart created successfully.", chartSpec: spec };
  }

  return { content: `Unknown tool: ${name}` };
}
