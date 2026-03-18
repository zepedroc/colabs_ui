import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { ModelSelector } from "@/components/ModelSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const DEFAULT_BENCHMARK_MODELS: [string, string, string] = [
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];

export function BenchmarkPage() {
  const [numQuestions, setNumQuestions] = useState(10);
  const [rounds, setRounds] = useState(2);
  const [selectedModels, setSelectedModels] =
    useState<[string, string, string]>(DEFAULT_BENCHMARK_MODELS);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<Id<"benchmarkRuns"> | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());
  const totalQuestions = useQuery(api.benchmark.getTotalQuestions) ?? 10;
  const benchmarks = useQuery(api.benchmark.getBenchmarks) || [];

  useEffect(() => {
    if (totalQuestions > 0 && numQuestions > totalQuestions) {
      setNumQuestions(totalQuestions);
    }
  }, [totalQuestions, numQuestions]);

  const benchmarkCaseResults = useQuery(
    api.benchmark.getBenchmarkCaseResults,
    selectedBenchmarkId ? { benchmarkId: selectedBenchmarkId } : "skip",
  );
  const startBenchmark = useMutation(api.benchmark.startBenchmark);

  const handleStartBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) return;

    setIsRunning(true);
    setError(null);

    try {
      await startBenchmark({
        models: selectedModels,
        numQuestions,
        rounds,
      });
      setSelectedBenchmarkId(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to run benchmark.");
    } finally {
      setIsRunning(false);
    }
  };

  const [now, setNow] = useState(Date.now());
  const hasRunningBenchmark = benchmarks.some((b) => b.status === "running");
  const displayedBenchmarks = hasRunningBenchmark
    ? benchmarks.filter((b) => b.status === "running")
    : benchmarks;

  useEffect(() => {
    if (!hasRunningBenchmark) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningBenchmark]);

  const formatDuration = (startTime: number, endTime?: number) => {
    const end = endTime ?? now;
    const durationMs = end - startTime;
    const totalSeconds = durationMs / 1000;
    if (totalSeconds >= 60) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}m ${seconds}s`;
    }
    return `${totalSeconds.toFixed(1)}s`;
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  const toggleResponseExpanded = (key: string) => {
    setExpandedResponses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Start New Benchmark */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Start New Benchmark</CardTitle>
              <CardDescription>
                Stores runs in Convex and streams detailed results from the benchmark.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStartBenchmark} className="flex flex-col gap-3">
                <ModelSelector
                  value={selectedModels}
                  onChange={setSelectedModels}
                  disabled={isRunning}
                  dropdownPosition="down"
                />
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <label htmlFor="numQuestions" className="text-sm font-medium">
                      Questions
                    </label>
                    <Input
                      id="numQuestions"
                      type="number"
                      min={1}
                      max={totalQuestions}
                      value={numQuestions}
                      onChange={(e) =>
                        setNumQuestions(
                          Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), totalQuestions),
                        )
                      }
                      className="w-20"
                    />
                    <span className="text-sm text-slate-500">/ {totalQuestions}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="rounds" className="text-sm font-medium">
                      Rounds
                    </label>
                    <Input
                      id="rounds"
                      type="number"
                      min={1}
                      max={10}
                      value={rounds}
                      onChange={(e) =>
                        setRounds(Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), 10))
                      }
                      className="w-20"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={isRunning}>
                  {isRunning ? "Running..." : "Start Benchmark"}
                </Button>
              </form>
              {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
            </CardContent>
          </Card>

          {/* Benchmark Results */}
          <div className="space-y-4">
            {displayedBenchmarks.length === 0 ? (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>No benchmark runs yet</CardTitle>
                  <CardDescription>
                    Start your first benchmark to see Convex run history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center text-4xl pb-6">📊</CardContent>
              </Card>
            ) : (
              displayedBenchmarks.map((benchmark) => (
                <Card
                  key={benchmark._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBenchmarkId(benchmark._id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedBenchmarkId(benchmark._id);
                    }
                  }}
                  className={
                    selectedBenchmarkId === benchmark._id
                      ? "ring-2 ring-primary/30 ring-offset-2 cursor-pointer"
                      : "cursor-pointer"
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{benchmark.name}</CardTitle>
                        <CardDescription>
                          Started {new Date(benchmark.startTime).toLocaleString()}
                        </CardDescription>
                        {benchmark.activeCase && benchmark.status === "running" && (
                          <p className="text-xs text-primary mt-1">{benchmark.activeCase}</p>
                        )}
                        {benchmark.errorMessage && benchmark.status === "failed" && (
                          <p className="text-xs text-red-700 mt-1">{benchmark.errorMessage}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            benchmark.status === "completed"
                              ? "success"
                              : benchmark.status === "running"
                                ? "info"
                                : "destructive"
                          }
                        >
                          {benchmark.status}
                        </Badge>
                        <span className="text-sm text-slate-500">
                          {formatDuration(benchmark.startTime, benchmark.endTime)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  {benchmark.results && (
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-slate-50/80 border-slate-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-slate-600">Round 1 Accuracy</div>
                            <div className="text-2xl font-bold text-emerald-600">
                              {formatPercentage(benchmark.results.round1Accuracy)}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-slate-50/80 border-slate-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-slate-600">Final Accuracy</div>
                            <div className="text-2xl font-bold text-primary">
                              {formatPercentage(benchmark.results.finalAccuracy)}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-slate-50/80 border-slate-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-slate-600">Improvement</div>
                            <div className="text-2xl font-bold text-teal-600">
                              {formatPercentage(benchmark.results.delta)}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  )}

                  {benchmark.status === "running" && (
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-primary">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-200 border-t-primary"></div>
                        <span className="text-sm">Running benchmark...</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>

          <div className="space-y-4 mt-6">
            {!selectedBenchmarkId ? (
              <Card>
                <CardContent className="p-4 text-sm text-slate-600">
                  Click a benchmark run above to inspect model-by-model answers.
                </CardContent>
              </Card>
            ) : benchmarkCaseResults === undefined ? (
              <Card>
                <CardContent className="p-4 text-sm text-slate-600">
                  Loading case details...
                </CardContent>
              </Card>
            ) : benchmarkCaseResults.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-slate-600">
                  No case-level details available yet for this run.
                </CardContent>
              </Card>
            ) : (
              benchmarkCaseResults
                .slice()
                .sort((a, b) => a.caseIndex - b.caseIndex)
                .map((benchmark) => (
                  <Card key={benchmark._id}>
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg">Case {benchmark.caseIndex + 1}</CardTitle>
                          <CardDescription className="break-words">
                            {benchmark.question}
                          </CardDescription>
                        </div>
                        <div className="flex-shrink-0">
                          <Badge variant="info" className="whitespace-nowrap">
                            Expected: {benchmark.expectedOption}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {benchmark.modelResults.map((modelResult) => {
                          const hasResponse =
                            (modelResult.round1RawResponse != null &&
                              modelResult.round1RawResponse !== "") ||
                            (modelResult.finalRawResponse != null &&
                              modelResult.finalRawResponse !== "");
                          const responseKey = `${benchmark._id}-${modelResult.model}`;
                          const isExpanded = expandedResponses.has(responseKey);

                          return (
                            <div
                              key={modelResult.model}
                              className="border border-slate-200 rounded-lg p-3"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-medium">{modelResult.model}</span>
                                <div className="flex gap-2 items-center flex-wrap">
                                  <Badge
                                    variant={modelResult.round1Correct ? "success" : "destructive"}
                                  >
                                    round1: {modelResult.round1Option ?? "n/a"}
                                  </Badge>
                                  <Badge
                                    variant={modelResult.finalCorrect ? "success" : "destructive"}
                                  >
                                    final: {modelResult.finalOption ?? "n/a"}
                                  </Badge>
                                  {hasResponse && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => toggleResponseExpanded(responseKey)}
                                    >
                                      {isExpanded ? "Hide response" : "View response"}
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {(modelResult.round1ParseError || modelResult.finalParseError) && (
                                <p className="text-xs text-red-700 mt-2">
                                  Parse issue:{" "}
                                  {modelResult.finalParseError ??
                                    modelResult.round1ParseError ??
                                    "Unknown parsing error"}
                                </p>
                              )}
                              {isExpanded && hasResponse && (
                                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                  {modelResult.round1RawResponse != null &&
                                    modelResult.round1RawResponse !== "" && (
                                      <div>
                                        <div className="text-xs font-medium text-slate-500 mb-1">
                                          Round 1 response
                                        </div>
                                        <pre className="text-xs bg-slate-50 rounded p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                                          {modelResult.round1RawResponse}
                                        </pre>
                                      </div>
                                    )}
                                  {modelResult.finalRawResponse != null &&
                                    modelResult.finalRawResponse !== "" && (
                                      <div>
                                        <div className="text-xs font-medium text-slate-500 mb-1">
                                          Final response
                                        </div>
                                        <pre className="text-xs bg-slate-50 rounded p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                                          {modelResult.finalRawResponse}
                                        </pre>
                                      </div>
                                    )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
