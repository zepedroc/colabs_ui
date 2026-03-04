import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { Routes, Route, NavLink } from "react-router-dom";
import { ChatPage } from "./ChatPage";
import { BenchmarkPage } from "./BenchmarkPage";
import { LifeManagementPage } from "./LifeManagementPage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <div className="flex items-center gap-6">
          <NavLink to="/">
            <Button
              variant="link"
              size="sm"
              className="text-xl font-semibold text-primary p-0 h-auto"
            >
              Colabs AI
            </Button>
          </NavLink>
          <Authenticated>
            <nav className="flex gap-2">
              <NavLink to="/chat">
                {({ isActive }) => (
                  <Button variant={isActive ? "default" : "ghost"} size="sm">
                    Chat
                  </Button>
                )}
              </NavLink>
              <NavLink to="/benchmark">
                {({ isActive }) => (
                  <Button variant={isActive ? "default" : "ghost"} size="sm">
                    Benchmark
                  </Button>
                )}
              </NavLink>
              <NavLink to="/life-management">
                {({ isActive }) => (
                  <Button variant={isActive ? "default" : "ghost"} size="sm">
                    Life Management
                  </Button>
                )}
              </NavLink>
            </nav>
          </Authenticated>
        </div>
        <SignOutButton />
      </header>
      <main className="flex-1 min-h-0 flex flex-col">
        <Content />
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/benchmark" element={<BenchmarkPage />} />
          <Route path="/life-management" element={<LifeManagementPage />} />
        </Routes>
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
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-4xl text-primary">Colabs AI</CardTitle>
            <CardDescription className="text-base">
              Collaborative AI Agents Platform
            </CardDescription>
            <p className="text-sm text-gray-600">
              Sign in to start collaborating with AI agents
            </p>
          </CardHeader>
          <CardContent>
            <SignInForm />
          </CardContent>
        </Card>
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
          <Card className="text-left">
            <CardHeader>
              <CardTitle className="text-xl">AI Council Chat</CardTitle>
              <CardDescription className="text-gray-600">
                Engage with multiple AI agents in collaborative discussions and get
                diverse perspectives on your queries.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-gray-500 space-y-1">
              <p>• Multi-agent collaboration</p>
              <p>• Diverse AI perspectives</p>
              <p>• Real-time responses</p>
            </CardContent>
          </Card>
          <Card className="text-left">
            <CardHeader>
              <CardTitle className="text-xl">AI Benchmarks</CardTitle>
              <CardDescription className="text-gray-600">
                Run performance benchmarks on AI agents to evaluate their accuracy,
                latency, and throughput.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-gray-500 space-y-1">
              <p>• Performance metrics</p>
              <p>• Accuracy testing</p>
              <p>• Latency analysis</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
