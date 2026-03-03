import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

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
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Start New Benchmark</h2>
            <form onSubmit={handleStartBenchmark} className="flex gap-3">
              <input
                type="text"
                value={benchmarkName}
                onChange={(e) => setBenchmarkName(e.target.value)}
                placeholder="Enter benchmark name..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <button
                type="submit"
                disabled={!benchmarkName.trim() || isRunning}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning ? "Starting..." : "Start Benchmark"}
              </button>
            </form>
          </div>

          {/* Benchmark Results */}
          <div className="space-y-4">
            {benchmarks.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <div className="text-4xl mb-4">📊</div>
                <p className="text-lg mb-2">No benchmarks yet</p>
                <p className="text-sm">Start your first benchmark to see performance metrics</p>
              </div>
            ) : (
              benchmarks.map((benchmark) => (
                <div key={benchmark._id} className="bg-white rounded-lg shadow-sm border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{benchmark.name}</h3>
                      <p className="text-sm text-gray-500">
                        Started {new Date(benchmark.startTime).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          benchmark.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : benchmark.status === "running"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {benchmark.status}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDuration(benchmark.startTime, benchmark.endTime)}
                      </span>
                    </div>
                  </div>

                  {benchmark.results && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-sm text-gray-600">Accuracy</div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatPercentage(benchmark.results.accuracy)}
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-sm text-gray-600">Latency</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {benchmark.results.latency.toFixed(0)}ms
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="text-sm text-gray-600">Throughput</div>
                        <div className="text-2xl font-bold text-purple-600">
                          {benchmark.results.throughput.toFixed(0)} req/s
                        </div>
                      </div>
                    </div>
                  )}

                  {benchmark.status === "running" && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-blue-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm">Running benchmark...</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
