import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { useState } from "react";
import { ChatPage } from "./ChatPage";
import { BenchmarkPage } from "./BenchmarkPage";

type Page = "home" | "chat" | "benchmark";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setCurrentPage("home")}
            className="text-xl font-semibold text-primary hover:text-primary-hover transition-colors"
          >
            Colabs AI
          </button>
          <Authenticated>
            <nav className="flex gap-4">
              <button
                onClick={() => setCurrentPage("chat")}
                className={`px-3 py-1 rounded transition-colors ${
                  currentPage === "chat"
                    ? "bg-primary text-white"
                    : "text-gray-600 hover:text-primary"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setCurrentPage("benchmark")}
                className={`px-3 py-1 rounded transition-colors ${
                  currentPage === "benchmark"
                    ? "bg-primary text-white"
                    : "text-gray-600 hover:text-primary"
                }`}
              >
                Benchmark
              </button>
            </nav>
          </Authenticated>
        </div>
        <SignOutButton />
      </header>
      <main className="flex-1">
        <Content currentPage={currentPage} />
      </main>
      <Toaster />
    </div>
  );
}

function Content({ currentPage }: { currentPage: Page }) {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Authenticated>
        {currentPage === "home" && <HomePage />}
        {currentPage === "chat" && <ChatPage />}
        {currentPage === "benchmark" && <BenchmarkPage />}
      </Authenticated>
      <Unauthenticated>
        <UnauthenticatedContent />
      </Unauthenticated>
    </>
  );
}

function UnauthenticatedContent() {
  return (
    <div className="flex items-center justify-center p-8 h-full">
      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-primary mb-4">Colabs AI</h1>
            <p className="text-xl text-secondary mb-2">
              Collaborative AI Agents Platform
            </p>
            <p className="text-gray-600">
              Sign in to start collaborating with AI agents
            </p>
          </div>
          <SignInForm />
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  return (
    <div className="flex items-center justify-center p-8 h-full">
      <div className="w-full max-w-2xl mx-auto text-center">
        <h1 className="text-5xl font-bold text-primary mb-6">Welcome to Colabs AI</h1>
        <p className="text-xl text-secondary mb-8">
          Hello, {loggedInUser?.email ?? "friend"}! Ready to collaborate with AI agents?
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-xl font-semibold mb-3">AI Council Chat</h3>
            <p className="text-gray-600 mb-4">
              Engage with multiple AI agents in collaborative discussions and get diverse perspectives on your queries.
            </p>
            <div className="text-sm text-gray-500">
              • Multi-agent collaboration
              • Diverse AI perspectives
              • Real-time responses
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-xl font-semibold mb-3">AI Benchmarks</h3>
            <p className="text-gray-600 mb-4">
              Run performance benchmarks on AI agents to evaluate their accuracy, latency, and throughput.
            </p>
            <div className="text-sm text-gray-500">
              • Performance metrics
              • Accuracy testing
              • Latency analysis
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
