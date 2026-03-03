import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
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
  const [isRunning, setIsRunning] = useState(false);

  const benchmarks = useQuery(api.benchmark.getBenchmarks) || [];
  const startBenchmark = useMutation(api.benchmark.startBenchmark);

  const handleStartBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!benchmarkName.trim() || isRunning) return;

    setIsRunning(true);
    try {
      await startBenchmark({ name: benchmarkName });
      setBenchmarkName("");
    } catch (error) {
      console.error("Failed to start benchmark:", error);
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
        <p className="text-gray-600">Evaluate AI agent performance</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Start New Benchmark */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Start New Benchmark</CardTitle>
            </CardHeader>
            <CardContent>
            <form onSubmit={handleStartBenchmark} className="flex gap-3">
              <Input
                type="text"
                value={benchmarkName}
                onChange={(e) => setBenchmarkName(e.target.value)}
                placeholder="Enter benchmark name..."
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={!benchmarkName.trim() || isRunning}
              >
                {isRunning ? "Starting..." : "Start Benchmark"}
              </Button>
            </form>
            </CardContent>
          </Card>

          {/* Benchmark Results */}
          <div className="space-y-4">
            {benchmarks.length === 0 ? (
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>No benchmarks yet</CardTitle>
                  <CardDescription>
                    Start your first benchmark to see performance metrics.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center text-4xl pb-6">📊</CardContent>
              </Card>
            ) : (
              benchmarks.map((benchmark) => (
                <Card key={benchmark._id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                    <div>
                        <CardTitle className="text-lg">{benchmark.name}</CardTitle>
                        <CardDescription>
                        Started {new Date(benchmark.startTime).toLocaleString()}
                        </CardDescription>
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
                    </div>
                  </div>
                  </CardHeader>

                  {benchmark.results && (
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gray-50 border-gray-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-gray-600">Accuracy</div>
                            <div className="text-2xl font-bold text-green-600">
                          {formatPercentage(benchmark.results.accuracy)}
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gray-50 border-gray-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-gray-600">Latency</div>
                            <div className="text-2xl font-bold text-blue-600">
                              {benchmark.results.latency.toFixed(0)}ms
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gray-50 border-gray-100 shadow-none">
                          <CardContent className="p-4">
                            <div className="text-sm text-gray-600">Throughput</div>
                            <div className="text-2xl font-bold text-purple-600">
                              {benchmark.results.throughput.toFixed(0)} req/s
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
        </div>
      </div>
    </div>
  );
}
