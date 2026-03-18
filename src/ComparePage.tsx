import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Info, Trash2 } from "lucide-react";
import { MarkdownWithMath } from "@/components/MarkdownWithMath";
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

function getModelDisplayName(model: string): string {
  return model.split("/").pop() ?? model;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function formatSessionDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChatType(mode: CompareGenerationMode): string {
  return mode === "coding" ? "Coding" : "Text";
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
            <span className="font-medium text-slate-700">
              {formatLatency(getMessageLatency(msg))}
            </span>
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
  const [sessionId, setSessionId] = useState(() => `compare-${Date.now()}-${Math.random()}`);
  const [selectedModels, setSelectedModels] = useState<[string, string]>(DEFAULT_COMPARE_MODELS);
  const [generationMode, setGenerationMode] = useState<CompareGenerationMode>("answer");
  const [responseViewMode, setResponseViewMode] = useState<ResponseViewMode>("response");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<Doc<"chatMessages">["_id"] | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollOnMessagesRef = useRef(true);
  const messages = useQuery(api.chat.getMessages, { sessionId }) || [];
  const compareSessions = useQuery(api.compare.listSessions) || [];
  const sendMessage = useMutation(api.compare.sendMessage);
  const deleteSession = useMutation(api.compare.deleteSession);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length === 0 || !shouldScrollOnMessagesRef.current) {
      return;
    }
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    const query = message.trim();
    setMessage("");
    setRequestError(null);
    shouldScrollOnMessagesRef.current = true;
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
  const isWaitingForResponses = groups.length > 0 && groups[groups.length - 1].type === "user";
  const currentSessionSummary = compareSessions.find((session) => session.sessionId === sessionId);
  const currentChatMode: CompareGenerationMode = useMemo(() => {
    const hasCodingUserPrompt = messages.some(
      (msg) => msg.role === "user" && msg.source === "user" && msg.generationMode === "coding",
    );
    if (hasCodingUserPrompt) {
      return "coding";
    }
    const hasCodingArtifacts = messages.some(
      (msg) =>
        msg.role === "assistant" &&
        extractRenderArtifacts(extractMessageBody(msg.content)).some(
          (artifact) => artifact.kind === "html",
        ),
    );
    if (hasCodingArtifacts) {
      return "coding";
    }
    return currentSessionSummary?.mode ?? generationMode;
  }, [messages, currentSessionSummary, generationMode]);

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

  useEffect(() => {
    if (currentChatMode !== "coding" && responseViewMode === "preview") {
      setResponseViewMode("response");
    }
  }, [currentChatMode, responseViewMode]);

  const startNewCompare = () => {
    shouldScrollOnMessagesRef.current = true;
    setSessionId(`compare-${Date.now()}-${Math.random()}`);
    setRequestError(null);
  };

  const handleSelectSession = (
    nextSessionId: string,
    models: string[],
    mode: CompareGenerationMode,
  ) => {
    shouldScrollOnMessagesRef.current = false;
    setSessionId(nextSessionId);
    setGenerationMode(mode);
    setRequestError(null);
    if (models.length >= 2) {
      const nextModels: [string, string] = [models[0], models[1]];
      setSelectedModels(nextModels);
    }
  };

  const handleDeleteSession = async (targetSessionId: string) => {
    if (deletingSessionId || isSubmitting) {
      return;
    }

    setDeletingSessionId(targetSessionId);
    setRequestError(null);
    try {
      await deleteSession({ sessionId: targetSessionId });
      if (targetSessionId === sessionId) {
        setSessionId(`compare-${Date.now()}-${Math.random()}`);
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to delete chat.");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleCopyPrompt = async (messageId: Doc<"chatMessages">["_id"], prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1200);
    } catch {
      setRequestError("Failed to copy prompt.");
    }
  };

  const responseViewToggle = (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
        <span className="text-xs font-medium text-slate-600">View</span>
        <Tabs
          value={responseViewMode}
          onValueChange={(value) => setResponseViewMode(value as ResponseViewMode)}
        >
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
    <div className="h-full min-h-0">
      <aside className="fixed left-4 top-20 bottom-28 z-20 hidden w-72 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-lg backdrop-blur lg:flex">
        <div className="border-b border-slate-200/70 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">Compare history</p>
          <p className="text-xs text-slate-500">{compareSessions.length} chats</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {compareSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">
              No previous compare chats yet.
            </div>
          ) : (
            <div className="space-y-2">
              {compareSessions.map((session) => {
                const isActive = session.sessionId === sessionId;
                const prompt = session.prompt.trim() ? session.prompt : "Untitled compare chat";
                const isDeleting = deletingSessionId === session.sessionId;
                return (
                  <div
                    key={session.sessionId}
                    className={[
                      "relative rounded-xl border transition-colors",
                      isActive
                        ? "border-primary/30 bg-primary/5"
                        : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectSession(session.sessionId, session.models, session.mode)
                      }
                      disabled={isSubmitting || isDeleting}
                      className="w-full px-3 py-2.5 pr-10 text-left"
                    >
                      <div className="mb-1">
                        <span
                          className={[
                            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            session.mode === "coding"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700",
                          ].join(" ")}
                        >
                          {formatChatType(session.mode)}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-800">
                        {truncateText(prompt, 80)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {session.models.length > 0
                          ? session.models.map(getModelDisplayName).join(" vs ")
                          : "No model data"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatSessionDate(session.startedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(session.sessionId)}
                      disabled={isSubmitting || isDeleting}
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="flex h-full min-h-0 flex-col lg:pl-[19rem]">
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
                  Pick two models, ask a question, and see their responses appear as soon as each
                  one finishes.
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
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopyPrompt(msg._id, msg.content)}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-teal-100/90 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                                  aria-label="Copy prompt"
                                >
                                  {copiedMessageId === msg._id ? (
                                    <Check className="h-3.5 w-3.5" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <div className="text-xs text-teal-100">
                                  {new Date(msg._creationTime).toLocaleTimeString()}
                                </div>
                              </div>
                            </div>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  }

                  if (group.type === "round" || group.type === "final") {
                    const messagesByModel = new Map(group.messages.map((m) => [m.model ?? "", m]));
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
                    const showViewToggle =
                      currentChatMode === "coding" &&
                      idx > 0 &&
                      filteredGroups[idx - 1]?.type === "user";

                    return (
                      <div key={groupKey} className="space-y-3">
                        {showViewToggle ? responseViewToggle : null}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                          {slots.map(({ modelId, msg }) => {
                            if (!msg) {
                              return <LoadingCard key={`loading-${modelId}`} modelName={modelId} />;
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
                            <MarkdownWithMath>{msg.content}</MarkdownWithMath>
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
                        <LoadingCard key={`waiting-${modelId}`} modelName={modelId} />
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

        <div className="fixed bottom-6 left-0 right-0 z-10 flex justify-center px-4 pointer-events-none lg:pl-[19rem]">
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
                    <TabsTrigger
                      value="answer"
                      className="px-3 py-1 text-xs"
                      disabled={isSubmitting}
                    >
                      Answer
                    </TabsTrigger>
                    <TabsTrigger
                      value="coding"
                      className="px-3 py-1 text-xs"
                      disabled={isSubmitting}
                    >
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
              <Button
                type="submit"
                disabled={!message.trim() || isSubmitting}
                className="h-11 shrink-0"
              >
                {isSubmitting ? "Submitting..." : "Compare"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
