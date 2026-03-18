import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ModelResponseBody, type ResponseViewMode } from "@/components/messages/ModelResponseBody";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelSelector } from "@/components/ModelSelector";
import { extractMessageBody } from "@/lib/messages/extractMessageBody";
import { extractRenderArtifacts } from "@/lib/messages/extractRenderArtifacts";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

function LoadingCard({ modelName }: { modelName: string }) {
  return (
    <Card className="min-w-0 border border-slate-200/60 overflow-hidden animate-pulse">
      <CardHeader className="py-3 px-4 flex flex-row justify-between items-center gap-2 border-b border-slate-200/50">
        <span className="text-xs font-semibold text-slate-600">
          {modelName.split("/").pop() ?? modelName}
        </span>
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

function formatTokens(msg: Doc<"chatMessages">): string {
  const totalTokens =
    msg.totalTokens ??
    ((msg.promptTokens ?? msg.usagePromptTokens) !== undefined &&
    (msg.completionTokens ?? msg.usageCompletionTokens) !== undefined
      ? (msg.promptTokens ?? msg.usagePromptTokens ?? 0) +
        (msg.completionTokens ?? msg.usageCompletionTokens ?? 0)
      : undefined);
  return totalTokens !== undefined ? totalTokens.toLocaleString() : "-";
}

function formatCost(costUsd: number | undefined): string {
  if (costUsd === undefined) return "-";
  return `$${costUsd.toFixed(2)}`;
}

function formatLatency(latencyMs: number | undefined): string {
  if (latencyMs === undefined) return "-";
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(2)} s`;
  return `${Math.round(latencyMs)} ms`;
}

function getMessageLatency(msg: Doc<"chatMessages">): number | undefined {
  return msg.latencyMs ?? msg.responseTimeMs;
}

function MetricsInfo({ msg }: { msg: Doc<"chatMessages"> }) {
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
            <span className="font-medium text-slate-700">{formatLatency(getMessageLatency(msg))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type MessageGroup =
  | { type: "user"; messages: Doc<"chatMessages">[] }
  | { type: "round"; round: number; messages: Doc<"chatMessages">[] }
  | { type: "final"; messages: Doc<"chatMessages">[] }
  | { type: "single"; messages: Doc<"chatMessages">[] };

function groupMessages(messages: Doc<"chatMessages">[]): MessageGroup[] {
  const result: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push({ type: "user", messages: [msg] });
    } else {
      if (msg.source === "council_round" && msg.round != null) {
        if (currentGroup && currentGroup.type === "round" && currentGroup.round === msg.round) {
          currentGroup.messages.push(msg);
        } else {
          if (currentGroup) result.push(currentGroup);
          currentGroup = { type: "round", round: msg.round, messages: [msg] };
        }
      } else if (msg.source === "council_final") {
        if (currentGroup && currentGroup.type === "final") {
          currentGroup.messages.push(msg);
        } else {
          if (currentGroup) result.push(currentGroup);
          currentGroup = { type: "final", messages: [msg] };
        }
      } else {
        if (currentGroup) result.push(currentGroup);
        currentGroup = { type: "single", messages: [msg] };
        result.push(currentGroup);
        currentGroup = null;
      }
    }
  }
  if (currentGroup) result.push(currentGroup);
  return result;
}

function isFinalSameAsLastRound(
  finalGroup: { type: "final"; messages: Doc<"chatMessages">[] },
  lastRoundGroup: { type: "round"; round: number; messages: Doc<"chatMessages">[] } | null,
): boolean {
  if (!lastRoundGroup) return false;
  const finalByModel = new Map(finalGroup.messages.map((m) => [m.model ?? "", m]));
  const roundByModel = new Map(lastRoundGroup.messages.map((m) => [m.model ?? "", m]));
  if (finalByModel.size !== roundByModel.size) return false;
  for (const [model, finalMsg] of finalByModel) {
    const roundMsg = roundByModel.get(model);
    if (
      !roundMsg ||
      extractMessageBody(finalMsg.content) !== extractMessageBody(roundMsg.content)
    ) {
      return false;
    }
  }
  return true;
}

const DEFAULT_COMPARE_MODELS: [string, string] = [
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
];

type CompareGenerationMode = "answer" | "coding";

export function ComparePage() {
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState(
    () => `compare-${Date.now()}-${Math.random()}`,
  );
  const [selectedModels, setSelectedModels] =
    useState<[string, string]>(DEFAULT_COMPARE_MODELS);
  const [generationMode, setGenerationMode] = useState<CompareGenerationMode>("answer");
  const [responseViewMode, setResponseViewMode] = useState<ResponseViewMode>("response");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useQuery(api.chat.getMessages, { sessionId }) || [];
  const sendMessage = useMutation(api.compare.sendMessage);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    const query = message.trim();
    setMessage("");
    setRequestError(null);
    setIsSubmitting(true);

    try {
      await sendMessage({
        content: query,
        sessionId,
        models: selectedModels,
        generation: {
          mode: generationMode,
          artifact: generationMode === "coding" ? "html" : "none",
        },
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to send message.");
      setMessage(query);
    } finally {
      setIsSubmitting(false);
    }
  };

  const groups = groupMessages(messages);
  const isWaitingForResponses =
    groups.length > 0 && groups[groups.length - 1].type === "user";

  const filteredGroups = groups.filter((group, idx) => {
    if (group.type !== "final") return true;
    const lastRound = [...groups]
      .slice(0, idx)
      .reverse()
      .find(
        (g): g is { type: "round"; round: number; messages: Doc<"chatMessages">[] } =>
          g.type === "round",
      );
    return !isFinalSameAsLastRound(group, lastRound ?? null);
  });

  const hasHtmlPreview = useMemo(() => {
    const latestRenderableGroup = [...filteredGroups]
      .reverse()
      .find((group) => group.type !== "user");
    if (!latestRenderableGroup) return false;
    return latestRenderableGroup.messages.some((msg) =>
      extractRenderArtifacts(extractMessageBody(msg.content)).some(
        (artifact) => artifact.kind === "html",
      ),
    );
  }, [filteredGroups]);

  useEffect(() => {
    if (!hasHtmlPreview && responseViewMode === "preview") {
      setResponseViewMode("response");
    }
  }, [hasHtmlPreview, responseViewMode]);

  const startNewCompare = () => {
    setSessionId(`compare-${Date.now()}-${Math.random()}`);
    setRequestError(null);
  };

  const responseViewToggle = (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
        <span className="text-xs font-medium text-slate-600">View</span>
        <Tabs value={responseViewMode} onValueChange={(value) => setResponseViewMode(value as ResponseViewMode)}>
          <TabsList className="h-8 p-1">
            <TabsTrigger value="response" className="px-3 py-1 text-xs" disabled={isSubmitting}>
              Response
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="px-3 py-1 text-xs"
              disabled={isSubmitting || !hasHtmlPreview}
            >
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 pb-40 min-h-0">
        <div className="max-w-6xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="relative flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 overflow-hidden">
              <div
                className="absolute inset-0 -z-10 opacity-[0.4]"
                style={{
                  backgroundImage: `radial-gradient(circle at 30% 40%, rgba(14, 165, 233, 0.08) 0%, transparent 50%),
                    radial-gradient(circle at 70% 60%, rgba(20, 184, 166, 0.08) 0%, transparent 40%)`,
                }}
              />
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight text-center mb-3">
                Compare models side by side
              </h2>
              <p className="text-slate-600 text-center max-w-md mb-10">
                Pick two models, ask a question, and see their responses appear as soon as each one
                finishes.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {[
                  "Explain recursion with a simple example",
                  "What are the best practices for REST API design?",
                  "Compare TypeScript vs JavaScript",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 bg-white/80 hover:bg-white border border-slate-200/80 hover:border-teal-300/60 hover:shadow-md transition-all duration-200 shadow-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <p className="text-slate-400 text-xs mt-8">Or type your question below</p>
            </div>
          ) : (
            <>
              {filteredGroups.map((group, idx) => {
                if (group.type === "user") {
                  const msg = group.messages[0];
                  return (
                    <div key={msg._id} className="flex justify-end">
                      <Card className="max-w-xs lg:max-w-md bg-primary border-primary text-white">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <div className="text-sm font-medium">You</div>
                            <div className="text-xs text-teal-100 shrink-0">
                              {new Date(msg._creationTime).toLocaleTimeString()}
                            </div>
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                }

                if (group.type === "round" || group.type === "final") {
                  const messagesByModel = new Map(
                    group.messages.map((m) => [m.model ?? "", m]),
                  );
                  const sortedMessages = [...group.messages].sort((a, b) =>
                    (a.model ?? "").localeCompare(b.model ?? ""),
                  );
                  const isLastGroup = idx === filteredGroups.length - 1;
                  const isRoundInProgress =
                    group.type === "round" &&
                    isLastGroup &&
                    group.messages.length < selectedModels.length;
                  const slots = isRoundInProgress
                    ? selectedModels.map((modelId) => ({
                        modelId,
                        msg: messagesByModel.get(modelId),
                      }))
                    : sortedMessages.map((m) => ({
                        modelId: m.model ?? "Unknown",
                        msg: m,
                      }));
                  const groupKey =
                    group.type === "round"
                      ? `round-${group.round}`
                      : `final-${group.messages.map((m) => m._id).join("-")}`;
                  const showViewToggle = idx > 0 && filteredGroups[idx - 1]?.type === "user";

                  return (
                    <div key={groupKey} className="space-y-3">
                      {showViewToggle ? responseViewToggle : null}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                        {slots.map(({ modelId, msg }) => {
                          if (!msg) {
                            return (
                              <LoadingCard
                                key={`loading-${modelId}`}
                                modelName={modelId}
                              />
                            );
                          }
                          return (
                            <div
                              key={msg._id}
                              className="min-w-0 rounded-lg border border-slate-200/60 overflow-hidden"
                            >
                              <div className="py-3 px-4 flex flex-row justify-between items-center gap-2 border-b border-slate-200/50">
                                <span className="text-xs font-semibold text-slate-700 truncate min-w-0">
                                  {(msg.model ?? "Unknown").split("/").pop() ?? msg.model}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] text-slate-400 tabular-nums">
                                    {new Date(msg._creationTime).toLocaleTimeString()}
                                  </span>
                                  <MetricsInfo msg={msg} />
                                </div>
                              </div>
                              <div className="px-4 py-4 text-sm text-slate-800">
                                <ModelResponseBody
                                  content={msg.content}
                                  viewMode={responseViewMode}
                                  className="prose prose-sm prose-agent max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 first:prose-p:mt-0"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return group.messages.map((msg) => (
                  <div key={msg._id} className="flex justify-start">
                    <Card
                      className={
                        msg.source === "council_error"
                          ? "w-full max-w-2xl border-red-200 bg-red-50/50 shadow-sm"
                          : "max-w-full lg:max-w-2xl shadow-sm border-l-4 border-l-primary/40"
                      }
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                          <span className="text-sm font-semibold text-slate-800">
                            {msg.model ? msg.model.split("/").pop() : "Model"}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                            {new Date(msg._creationTime).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="prose prose-sm prose-agent max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ));
              })}
              {isWaitingForResponses && (
                <div className="space-y-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                    Responding...
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    {selectedModels.map((modelId) => (
                      <LoadingCard
                        key={`waiting-${modelId}`}
                        modelName={modelId}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {requestError && (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-4 text-red-700">{requestError}</CardContent>
            </Card>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-10 pointer-events-none">
        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_1px_rgba(0,0,0,0.1)] border border-slate-200/80 p-4 flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 shrink-0"
              onClick={startNewCompare}
              disabled={isSubmitting}
            >
              New compare
            </Button>
            <ModelSelector
              count={2}
              value={selectedModels}
              onChange={setSelectedModels}
              disabled={isSubmitting}
            />
            <div className="flex items-center gap-1.5 shrink-0 text-sm text-slate-600">
              <span>Prompt:</span>
              <Tabs
                value={generationMode}
                onValueChange={(value) => setGenerationMode(value as CompareGenerationMode)}
              >
                <TabsList className="h-9 p-1">
                  <TabsTrigger value="answer" className="px-3 py-1 text-xs" disabled={isSubmitting}>
                    Answer
                  </TabsTrigger>
                  <TabsTrigger value="coding" className="px-3 py-1 text-xs" disabled={isSubmitting}>
                    Coding
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div className="flex gap-3">
            <Input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                generationMode === "coding"
                  ? "Ask for an HTML visualization to compare..."
                  : "Ask a question to compare..."
              }
              className="h-11 flex-1 min-w-0"
              disabled={isSubmitting}
            />
            <Button type="submit" disabled={!message.trim() || isSubmitting} className="h-11 shrink-0">
              {isSubmitting ? "Submitting..." : "Compare"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
