import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getModelShortName } from "@/lib/modelDisplay";

export function CompareLoadingCard({ modelName }: { modelName: string }) {
  return (
    <Card className="min-w-0 border border-slate-200/60 overflow-hidden animate-pulse">
      <CardHeader className="py-3 px-4 flex flex-row justify-between items-center gap-2 border-b border-slate-200/50">
        <span className="text-xs font-semibold text-slate-600">{getModelShortName(modelName)}</span>
      </CardHeader>
      <CardContent className="px-4 py-4">
        <div className="flex gap-2">
          <div className="h-3 flex-1 rounded bg-slate-200/60" />
          <div className="h-3 flex-1 rounded bg-slate-200/60" />
          <div className="h-3 w-1/3 rounded bg-slate-200/60" />
        </div>
        <div className="flex gap-2 mt-2">
          <div className="h-3 flex-1 rounded bg-slate-200/40" />
          <div className="h-3 w-2/3 rounded bg-slate-200/40" />
        </div>
      </CardContent>
    </Card>
  );
}
