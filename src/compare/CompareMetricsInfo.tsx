import { Info } from "lucide-react";
import type { Doc } from "../../convex/_generated/dataModel";
import { formatCost, formatLatency, formatTokens, getMessageLatency } from "./messageMetrics";

export function CompareMetricsInfo({ msg }: { msg: Doc<"chatMessages"> }) {
  return (
    <div className="relative group/metrics">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded-sm"
        aria-label="Show response metrics"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <div className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lg opacity-0 translate-y-1 transition-all duration-150 group-hover/metrics:opacity-100 group-hover/metrics:translate-y-0 group-focus-within/metrics:opacity-100 group-focus-within/metrics:translate-y-0">
        <div className="text-[11px] text-slate-500 space-y-1">
          <div className="flex justify-between gap-3">
            <span>Tokens</span>
            <span className="font-medium text-slate-700">{formatTokens(msg)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Cost</span>
            <span className="font-medium text-slate-700">{formatCost(msg.costUsd)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Response time</span>
            <span className="font-medium text-slate-700">
              {formatLatency(getMessageLatency(msg))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
