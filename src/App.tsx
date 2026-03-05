import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { NavLink, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../convex/_generated/api";
import { BenchmarkPage } from "./BenchmarkPage";
import { ChatPage } from "./ChatPage";
import { LifeManagementPage } from "./LifeManagementPage";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="h-14 flex justify-between items-center px-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex items-center">
              <span className="text-lg font-semibold text-slate-900 tracking-tight">
                Colabs AI
              </span>
            </NavLink>
            <Authenticated>
              <nav className="flex gap-1">
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
        </div>
      </header>
      <main className="flex-1 min-h-0 flex flex-col">
        <Content />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center h-full min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-primary"></div>
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
    <div className="flex items-center justify-center p-8 h-full min-h-[400px]">
      <div className="w-full max-w-md mx-auto">
        <Card className="shadow-lg">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-3xl font-bold text-slate-900">Colabs AI</CardTitle>
            <CardDescription className="text-base text-slate-600">
              Collaborative AI Agents Platform
            </CardDescription>
            <p className="text-sm text-slate-500">Sign in to start collaborating with AI agents</p>
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
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">Welcome to Colabs AI</h1>
          <p className="text-lg text-slate-600">
            Hello, {loggedInUser?.email ?? "friend"}! Ready to collaborate with AI agents?
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="text-left hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">AI Council Chat</CardTitle>
              <CardDescription className="text-slate-600">
                Engage with multiple AI agents in collaborative discussions and get diverse
                perspectives on your queries.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-500 space-y-1">
              <p>• Multi-agent collaboration</p>
              <p>• Diverse AI perspectives</p>
              <p>• Real-time responses</p>
            </CardContent>
          </Card>
          <Card className="text-left hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-slate-900">AI Benchmarks</CardTitle>
              <CardDescription className="text-slate-600">
                Run performance benchmarks on AI agents to evaluate their accuracy, latency, and
                throughput.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-500 space-y-1">
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
