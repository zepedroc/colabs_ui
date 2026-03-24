import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { MarkdownWithMath } from "@/components/MarkdownWithMath";
import { SessionHistorySidebar } from "@/components/SessionHistorySidebar";
import { useSessionMessagesQuery } from "@/hooks/useSessionMessagesQuery";
import { ModelResponseBody, type ResponseViewMode } from "@/components/messages/ModelResponseBody";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloatingSettingsPanel, SettingsField } from "@/components/FloatingSettingsPanel";
import { ModelSelector } from "@/components/ModelSelector";
import { formatRequestedToResolvedShort, getModelShortName } from "@/lib/modelDisplay";
import { extractMessageBody } from "@/lib/messages/extractMessageBody";
import { extractRenderArtifacts } from "@/lib/messages/extractRenderArtifacts";
import { CompareLoadingCard } from "@/compare/CompareLoadingCard";
import { CompareMetricsInfo } from "@/compare/CompareMetricsInfo";
import { normalizeCodingArtifact } from "@/compare/artifacts";
import { DEFAULT_COMPARE_MODELS } from "@/compare/constants";
import { compareHistoryBadgeClass, formatCompareHistoryBadge } from "@/compare/historyBadges";
import { filterRedundantFinalGroups, groupMessages } from "@/compare/messageGroups";
import type {
  CompareCodingArtifact,
  CompareGenerationMode,
  StoredCompareCodingArtifact,
} from "@/compare/types";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

export function ComparePage() {
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState(() => `compare-${Date.now()}-${Math.random()}`);
  const [selectedModels, setSelectedModels] = useState<[string, string]>(DEFAULT_COMPARE_MODELS);
  const [generationMode, setGenerationMode] = useState<CompareGenerationMode>("answer");
  const [codingArtifact, setCodingArtifact] = useState<CompareCodingArtifact>("html");
  const [responseViewMode, setResponseViewMode] = useState<ResponseViewMode>("response");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<Doc<"chatMessages">["_id"] | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollOnMessagesRef = useRef(true);
  const messagesQuery = useQuery(api.chat.getMessages, { sessionId });
  const { messages, isSwitchLoading } = useSessionMessagesQuery(sessionId, messagesQuery);
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
          artifact: generationMode === "coding" ? codingArtifact : "none",
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
          (artifact) => artifact.kind === "html" || artifact.kind === "r3f",
        ),
    );
    if (hasCodingArtifacts) {
      return "coding";
    }
    return currentSessionSummary?.mode ?? generationMode;
  }, [messages, currentSessionSummary, generationMode]);

  const filteredGroups = filterRedundantFinalGroups(groups);

  const hasArtifactPreview = useMemo(() => {
    const latestRenderableGroup = [...filteredGroups]
      .reverse()
      .find((group) => group.type !== "user");
    if (!latestRenderableGroup) return false;
    return latestRenderableGroup.messages.some((msg) =>
      extractRenderArtifacts(extractMessageBody(msg.content)).some(
        (artifact) => artifact.kind === "html" || artifact.kind === "r3f",
      ),
    );
  }, [filteredGroups]);

  useEffect(() => {
    if (!hasArtifactPreview && responseViewMode === "preview") {
      setResponseViewMode("response");
    }
  }, [hasArtifactPreview, responseViewMode]);

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
    artifact?: StoredCompareCodingArtifact,
  ) => {
    shouldScrollOnMessagesRef.current = false;
    setSessionId(nextSessionId);
    setGenerationMode(mode);
    setRequestError(null);
    if (mode === "coding") {
      setCodingArtifact(normalizeCodingArtifact(artifact));
    }
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
              disabled={isSubmitting || !hasArtifactPreview}
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
      <SessionHistorySidebar
        title="Compare history"
        sessions={compareSessions.map((session) => ({
          sessionId: session.sessionId,
          prompt: session.prompt,
          untitledFallback: "Untitled compare chat",
          modelsSummary:
            session.models.length > 0
              ? session.historyModelsSummary || session.models.map(getModelShortName).join(" vs ")
              : "No model data",
          startedAt: session.startedAt,
          badgeLabel: formatCompareHistoryBadge(session),
          badgeClassName: compareHistoryBadgeClass(session),
        }))}
        activeSessionId={sessionId}
        deletingSessionId={deletingSessionId}
        isSubmitting={isSubmitting}
        emptyMessage="No previous compare chats yet."
        onSelectSession={(id) => {
          const session = compareSessions.find((s) => s.sessionId === id);
          if (!session) return;
          handleSelectSession(
            session.sessionId,
            session.models,
            session.mode,
            session.codingArtifact,
          );
        }}
        onDeleteSession={handleDeleteSession}
        onNewChat={startNewCompare}
      />

      <div className="flex h-full min-h-0 flex-col lg:pl-[19rem]">
        <div className="flex-1 overflow-y-auto p-6 pb-40 min-h-0">
          <div className="max-w-6xl mx-auto space-y-6">
            {isSwitchLoading ? (
              <div
                className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500"
                role="status"
                aria-live="polite"
              >
                <div
                  className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600"
                  aria-hidden
                />
                <p className="text-sm">Loading chat…</p>
              </div>
            ) : messages.length === 0 ? (
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
                              return (
                                <CompareLoadingCard
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
                                    {formatRequestedToResolvedShort(msg.model, msg.resolvedModel)}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[11px] text-slate-400 tabular-nums">
                                      {new Date(msg._creationTime).toLocaleTimeString()}
                                    </span>
                                    <CompareMetricsInfo msg={msg} />
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
                              {msg.model
                                ? formatRequestedToResolvedShort(msg.model, msg.resolvedModel)
                                : "Model"}
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
                        <CompareLoadingCard key={`waiting-${modelId}`} modelName={modelId} />
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

        <FloatingSettingsPanel>
          <SettingsField label="Models">
            <ModelSelector
              count={2}
              value={selectedModels}
              onChange={setSelectedModels}
              disabled={isSubmitting}
            />
          </SettingsField>

          <SettingsField label="Prompt mode">
            <Tabs
              value={generationMode}
              onValueChange={(value) => setGenerationMode(value as CompareGenerationMode)}
            >
              <TabsList className="h-9 p-1 w-full">
                <TabsTrigger
                  value="answer"
                  className="flex-1 px-3 py-1 text-xs"
                  disabled={isSubmitting}
                >
                  Answer
                </TabsTrigger>
                <TabsTrigger
                  value="coding"
                  className="flex-1 px-3 py-1 text-xs"
                  disabled={isSubmitting}
                >
                  Coding
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </SettingsField>

          {generationMode === "coding" && (
            <SettingsField label="Artifact type">
              <Tabs
                value={codingArtifact}
                onValueChange={(value) => setCodingArtifact(value as CompareCodingArtifact)}
              >
                <TabsList className="h-9 p-1 w-full">
                  <TabsTrigger
                    value="html"
                    className="flex-1 px-3 py-1 text-xs"
                    disabled={isSubmitting}
                  >
                    HTML
                  </TabsTrigger>
                  <TabsTrigger
                    value="react"
                    className="flex-1 px-3 py-1 text-xs"
                    disabled={isSubmitting}
                  >
                    3D (R3F)
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </SettingsField>
          )}
        </FloatingSettingsPanel>

        <div className="fixed bottom-6 left-0 right-0 z-10 flex justify-center px-4 pointer-events-none lg:pl-[19rem]">
          <form
            onSubmit={handleSubmit}
            className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_1px_rgba(0,0,0,0.1)] border border-slate-200/80 p-4"
          >
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 shrink-0"
                onClick={startNewCompare}
                disabled={isSubmitting}
              >
                New chat
              </Button>
              <Input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  generationMode === "coding"
                    ? codingArtifact === "react"
                      ? "Ask for a React Three Fiber 3D scene to compare..."
                      : "Ask for an HTML visualization to compare..."
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
