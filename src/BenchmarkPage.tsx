import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function BenchmarkPage() {
  const [benchmarkName, setBenchmarkName] = useState("");
  const [filePath, setFilePath] = useState("benchmarks/questions.json");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState<Id<"benchmarkRuns"> | null>(null);
  const benchmarks = useQuery(api.benchmark.getBenchmarks) || [];
  const benchmarkCaseResults = useQuery(
    api.benchmark.getBenchmarkCaseResults,
    selectedBenchmarkId ? { benchmarkId: selectedBenchmarkId } : "skip",
  );
  const startBenchmark = useMutation(api.benchmark.startBenchmark);

  const handleStartBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!benchmarkName.trim() || isRunning) return;

    setIsRunning(true);
    setError(null);

    try {
      const benchmarkId = await startBenchmark({
        name: benchmarkName.trim(),
        filePath: filePath.trim() || undefined,
      });
      setSelectedBenchmarkId(benchmarkId);
      setBenchmarkName("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to run benchmark.");
    } finally {
      setIsRunning(false);
    }
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    const duration = (endTime || Date.now()) - startTime;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-primary">AI Benchmarks</h1>
        <p className="text-gray-600">Convex orchestrates benchmark runs via OpenRouter</p>
      </div>

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
                <Input
                  type="text"
                  value={benchmarkName}
                  onChange={(e) => setBenchmarkName(e.target.value)}
                  placeholder="Benchmark run name..."
                  className="flex-1"
                />
                <Input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="benchmarks/questions.json"
                  className="flex-1"
                />
                <Button type="submit" disabled={isRunning}>
                  {isRunning ? "Running..." : "Start Benchmark"}
                </Button>
              </form>
              {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
            </CardContent>
          </Card>

          {/* Benchmark Results */}
          <div className="space-y-4">
            {benchmarks.length === 0 ? (
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
              benchmarks.map((benchmark) => (
                <Card
                  key={benchmark._id}
                  className={selectedBenchmarkId === benchmark._id ? "ring-2 ring-blue-300" : ""}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{benchmark.name}</CardTitle>
                        <CardDescription>
                          Started {new Date(benchmark.startTime).toLocaleString()}
                        </CardDescription>
                        {benchmark.activeCase && benchmark.status === "running" && (
                          <p className="text-xs text-blue-700 mt-1">{benchmark.activeCase}</p>
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
                        <span className="text-sm text-gray-500">
                          {formatDuration(benchmark.startTime, benchmark.endTime)}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedBenchmarkId(benchmark._id)}
                        >
                          View details
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {benchmark.results && (
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gray-50 border-gray-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-gray-600">Round 1 Accuracy</div>
                            <div className="text-2xl font-bold text-green-600">
                              {formatPercentage(benchmark.results.round1Accuracy)}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gray-50 border-gray-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-gray-600">Final Accuracy</div>
                            <div className="text-2xl font-bold text-blue-600">
                              {formatPercentage(benchmark.results.finalAccuracy)}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gray-50 border-gray-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-gray-600">Improvement</div>
                            <div className="text-2xl font-bold text-purple-600">
                              {formatPercentage(benchmark.results.delta)}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  )}

                  {benchmark.status === "running" && (
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-blue-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm">Running benchmark...</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>

          <div className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Case Breakdown</CardTitle>
                <CardDescription>
                  {selectedBenchmarkId
                    ? "Detailed per-case output stored by Convex."
                    : "Choose a benchmark run to view detailed case output."}
                </CardDescription>
              </CardHeader>
            </Card>

            {!selectedBenchmarkId ? (
              <Card>
                <CardContent className="p-4 text-sm text-gray-600">
                  Select a run from above to inspect model-by-model answers.
                </CardContent>
              </Card>
            ) : benchmarkCaseResults === undefined ? (
              <Card>
                <CardContent className="p-4 text-sm text-gray-600">
                  Loading case details...
                </CardContent>
              </Card>
            ) : benchmarkCaseResults.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-gray-600">
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
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">Case {benchmark.caseIndex + 1}</CardTitle>
                          <CardDescription>{benchmark.question}</CardDescription>
                        </div>
                        <Badge variant="info">Expected: {benchmark.expectedOption}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {benchmark.modelResults.map((modelResult) => (
                          <div key={modelResult.model} className="border rounded-md p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{modelResult.model}</span>
                              <div className="flex gap-2">
                                <Badge variant={modelResult.round1Correct ? "success" : "destructive"}>
                                  round1: {modelResult.round1Option ?? "n/a"}
                                </Badge>
                                <Badge variant={modelResult.finalCorrect ? "success" : "destructive"}>
                                  final: {modelResult.finalOption ?? "n/a"}
                                </Badge>
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
                          </div>
                        ))}
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
