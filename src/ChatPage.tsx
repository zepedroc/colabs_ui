import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartBlock, type ChartSpec } from "@/components/ChartBlock";
import { ModelSelector, SingleModelSelector } from "@/components/ModelSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

type CouncilMode = "parallel" | "conversation" | "research";

const AGENT_COLORS = [
  {
    border: "border-l-sky-400",
    bg: "bg-gradient-to-br from-sky-50/90 to-white",
    accent: "text-sky-700",
    label: "bg-sky-100/80 text-sky-600 border border-sky-200/50",
  },
  {
    border: "border-l-teal-400",
    bg: "bg-gradient-to-br from-teal-50/90 to-white",
    accent: "text-teal-700",
    label: "bg-teal-100/80 text-teal-600 border border-teal-200/50",
  },
  {
    border: "border-l-amber-400",
    bg: "bg-gradient-to-br from-amber-50/90 to-white",
    accent: "text-amber-700",
    label: "bg-amber-100/80 text-amber-600 border border-amber-200/50",
  },
  {
    border: "border-l-indigo-400",
    bg: "bg-gradient-to-br from-indigo-50/90 to-white",
    accent: "text-indigo-700",
    label: "bg-indigo-100/80 text-indigo-600 border border-indigo-200/50",
  },
  {
    border: "border-l-pink-400",
    bg: "bg-gradient-to-br from-pink-50/90 to-white",
    accent: "text-pink-700",
    label: "bg-pink-100/80 text-pink-600 border border-pink-200/50",
  },
] as const;

/** Assign colors by index so each agent in a group gets a unique color. Same model = same index = same color. */
function getAgentColorByIndex(index: number): (typeof AGENT_COLORS)[number] {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}

function LoadingCard({
  modelName,
  colors,
}: {
  modelName: string;
  colors: (typeof AGENT_COLORS)[number];
}) {
  return (
    <Card
      className={`${colors.border} border-l-4 ${colors.bg} min-w-0 shadow-sm overflow-hidden animate-pulse`}
    >
      <CardHeader className="py-3 px-4 flex flex-row justify-between items-center gap-2 border-b border-slate-200/50">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-md w-fit ${colors.label}`}>
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

function extractMessageBody(content: string): string {
  const lines = content.split("\n");
  if (lines.length > 1) {
    return lines.slice(1).join("\n").trim() || content;
  }
  return content;
}

type MessageGroup =
  | { type: "user"; messages: Doc<"chatMessages">[] }
  | { type: "round"; round: number; messages: Doc<"chatMessages">[] }
  | { type: "final"; messages: Doc<"chatMessages">[] }
  | { type: "research_orchestrator"; round: number; messages: Doc<"chatMessages">[] }
  | { type: "research_round"; round: number; messages: Doc<"chatMessages">[] }
  | { type: "research_final"; messages: Doc<"chatMessages">[] }
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
      } else if (msg.source === "research_orchestrator") {
        const round = msg.round ?? 0;
        if (
          currentGroup &&
          currentGroup.type === "research_orchestrator" &&
          currentGroup.round === round
        ) {
          currentGroup.messages.push(msg);
        } else {
          if (currentGroup) result.push(currentGroup);
          currentGroup = { type: "research_orchestrator", round, messages: [msg] };
        }
      } else if (msg.source === "research_council" && msg.round != null) {
        if (
          currentGroup &&
          currentGroup.type === "research_round" &&
          currentGroup.round === msg.round
        ) {
          currentGroup.messages.push(msg);
        } else {
          if (currentGroup) result.push(currentGroup);
          currentGroup = { type: "research_round", round: msg.round, messages: [msg] };
        }
      } else if (msg.source === "research_final") {
        if (currentGroup && currentGroup.type === "research_final") {
          currentGroup.messages.push(msg);
        } else {
          if (currentGroup) result.push(currentGroup);
          currentGroup = { type: "research_final", messages: [msg] };
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

/** Returns true if final group content is identical to the last round group. */
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

const DEFAULT_COUNCIL_MODELS: [string, string, string] = [
  "stepfun/step-3.5-flash:free",
  "arcee-ai/trinity-large-preview:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
];
const DEFAULT_ORCHESTRATOR_MODEL = DEFAULT_COUNCIL_MODELS[0];

export function ChatPage() {
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const [rounds, setRounds] = useState(3);
  const [mode, setMode] = useState<CouncilMode>("parallel");
  const [selectedModels, setSelectedModels] =
    useState<[string, string, string]>(DEFAULT_COUNCIL_MODELS);
  const [orchestratorModel, setOrchestratorModel] = useState(DEFAULT_ORCHESTRATOR_MODEL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useQuery(api.chat.getMessages, { sessionId }) || [];
  const sendMessage = useMutation(api.chat.sendMessage);

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
        rounds,
        mode,
        models: selectedModels,
        orchestratorModel,
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to send message.");
      setMessage(query);
    } finally {
      setIsSubmitting(false);
    }
  };

  const groups = groupMessages(messages);

  /** True when the last message is from user and we're waiting for council responses */
  const isWaitingForCouncil = groups.length > 0 && groups[groups.length - 1].type === "user";

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

  const startNewChat = () => {
    setSessionId(`session-${Date.now()}-${Math.random()}`);
    setRequestError(null);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 pb-40 min-h-0">
        <div className="max-w-6xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="relative flex flex-col items-center justify-center min-h-[60vh] py-12 px-4 overflow-hidden">
              {/* Subtle background */}
              <div
                className="absolute inset-0 -z-10 opacity-[0.4]"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 30%, rgba(13, 148, 136, 0.08) 0%, transparent 50%),
                    radial-gradient(circle at 80% 70%, rgba(14, 165, 233, 0.06) 0%, transparent 40%),
                    radial-gradient(circle at 20% 80%, rgba(245, 158, 11, 0.05) 0%, transparent 40%)`,
                }}
              />
              <div
                className="absolute inset-0 -z-10 opacity-30"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              />
              {/* Floating council orbs */}
              <div className="relative mb-12">
                <div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-400/20 to-sky-400/20 blur-3xl -z-10"
                  style={{
                    width: 200,
                    height: 200,
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                />
                <div className="flex items-center justify-center gap-6">
                  <div
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 shadow-lg shadow-sky-400/30 animate-float-orb"
                    style={{ animationDelay: "0s" }}
                  />
                  <div
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-lg shadow-teal-400/30 animate-float-orb"
                    style={{ animationDelay: "0.4s" }}
                  />
                  <div
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-400/30 animate-float-orb"
                    style={{ animationDelay: "0.8s" }}
                  />
                </div>
              </div>

              {/* Headline */}
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight text-center mb-3 animate-fade-in-up [animation-fill-mode:forwards] opacity-0">
                Meet your AI council
              </h2>
              <p className="text-slate-600 text-center max-w-md mb-10 animate-fade-in-up [animation-delay:0.1s] [animation-fill-mode:forwards] opacity-0">
                Three models collaborate on every question—compare perspectives, debate ideas, and
                get richer answers.
              </p>

              {/* Suggested prompts */}
              <div className="flex flex-wrap justify-center gap-2 max-w-xl animate-fade-in-up [animation-delay:0.2s] [animation-fill-mode:forwards] opacity-0">
                {[
                  "Explain quantum entanglement in simple terms",
                  "Compare React vs Vue for a new project",
                  "Suggest a 3-day itinerary for Lisbon",
                  "What are the pros and cons of remote work?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 bg-white/80 hover:bg-white border border-slate-200/80 hover:border-teal-300/60 hover:shadow-md hover:shadow-teal-500/10 transition-all duration-200 shadow-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Subtle hint */}
              <p className="text-slate-400 text-xs mt-8 animate-fade-in-up [animation-delay:0.3s] [animation-fill-mode:forwards] opacity-0">
                Or type your own question below
              </p>
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

                if (group.type === "research_orchestrator") {
                  return (
                    <div key={`research-orchestrator-${group.round}`} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200/70">
                          Orchestrator · Round {group.round}
                        </span>
                      </div>
                      {group.messages.map((msg) => (
                        <Card
                          key={msg._id}
                          className="w-full border-l-4 border-l-violet-400 bg-gradient-to-br from-violet-50/80 to-white shadow-sm"
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center gap-2 mb-3 pb-2 border-b border-violet-100">
                              <span className="text-sm font-semibold text-violet-900">
                                {(msg.model ?? "Orchestrator").split("/").pop() ?? msg.model}
                              </span>
                              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                {new Date(msg._creationTime).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="prose prose-sm prose-agent max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 text-violet-900">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  );
                }

                if (group.type === "round" || group.type === "research_round") {
                  const title =
                    group.type === "round"
                      ? `Round ${group.round}`
                      : `Research council · Round ${group.round}`;
                  const messagesByModel = new Map(group.messages.map((m) => [m.model ?? "", m]));
                  const sortedMessages = [...group.messages].sort((a, b) =>
                    (a.model ?? "").localeCompare(b.model ?? ""),
                  );
                  const isLastGroup = idx === filteredGroups.length - 1;
                  const isRoundInProgress =
                    isLastGroup && group.messages.length < selectedModels.length;
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
                    group.type === "round" || group.type === "research_round"
                      ? `round-${group.round}`
                      : `research-round-${group.round}`;
                  return (
                    <div key={groupKey} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                          {title}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {slots.map(({ modelId, msg }, idx) => {
                          const colors = getAgentColorByIndex(idx);
                          if (!msg) {
                            return (
                              <LoadingCard
                                key={`loading-${modelId}`}
                                modelName={modelId}
                                colors={colors}
                              />
                            );
                          }
                          const body = extractMessageBody(msg.content);
                          return (
                            <Card
                              key={msg._id}
                              className={`${colors.border} border-l-4 ${colors.bg} min-w-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
                            >
                              <CardHeader className="py-3 px-4 flex flex-row justify-between items-center gap-2 border-b border-slate-200/50">
                                <span
                                  className={`text-xs font-semibold px-2.5 py-1 rounded-md w-fit ${colors.label}`}
                                >
                                  {(msg.model ?? "Unknown").split("/").pop() ?? msg.model}
                                </span>
                                <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                  {new Date(msg._creationTime).toLocaleTimeString()}
                                </span>
                              </CardHeader>
                              <CardContent className="px-4 py-4">
                                {msg.chartSpec &&
                                  typeof msg.chartSpec === "object" &&
                                  "type" in msg.chartSpec &&
                                  "labels" in msg.chartSpec &&
                                  "datasets" in msg.chartSpec && (
                                    <ChartBlock spec={msg.chartSpec as ChartSpec} />
                                  )}
                                <div
                                  className={`text-sm prose prose-sm prose-agent max-w-none ${colors.accent} prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 first:prose-p:mt-0`}
                                >
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (group.type === "final") {
                  const title = "Final answers";
                  const sortedMessages = [...group.messages].sort((a, b) =>
                    (a.model ?? "").localeCompare(b.model ?? ""),
                  );
                  return (
                    <div
                      key={`final-${group.messages.map((m) => m._id).join("-")}`}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                          {title}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sortedMessages.map((msg, modelIdx) => {
                          const colors = getAgentColorByIndex(modelIdx);
                          const body = extractMessageBody(msg.content);
                          return (
                            <Card
                              key={msg._id}
                              className={`${colors.border} border-l-4 ${colors.bg} min-w-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
                            >
                              <CardHeader className="py-3 px-4 flex flex-row justify-between items-center gap-2 border-b border-slate-200/50">
                                <span
                                  className={`text-xs font-semibold px-2.5 py-1 rounded-md w-fit ${colors.label}`}
                                >
                                  {(msg.model ?? "Unknown").split("/").pop() ?? msg.model}
                                </span>
                                <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                  {new Date(msg._creationTime).toLocaleTimeString()}
                                </span>
                              </CardHeader>
                              <CardContent className="px-4 py-4">
                                {msg.chartSpec &&
                                  typeof msg.chartSpec === "object" &&
                                  "type" in msg.chartSpec &&
                                  "labels" in msg.chartSpec &&
                                  "datasets" in msg.chartSpec && (
                                    <ChartBlock spec={msg.chartSpec as ChartSpec} />
                                  )}
                                <div
                                  className={`text-sm prose prose-sm prose-agent max-w-none ${colors.accent} prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 first:prose-p:mt-0`}
                                >
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                if (group.type === "research_final") {
                  const msg = group.messages[group.messages.length - 1];
                  if (!msg) return null;
                  return (
                    <div key={msg._id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200/70">
                          Research final
                        </span>
                      </div>
                      <Card className="w-full border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50/70 to-white shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-center gap-2 mb-3 pb-2 border-b border-emerald-100">
                            <span className="text-sm font-semibold text-emerald-900">
                              {(msg.model ?? "Orchestrator").split("/").pop() ?? msg.model}
                            </span>
                            <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                              {new Date(msg._creationTime).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="prose prose-sm prose-agent max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 text-emerald-900">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {extractMessageBody(msg.content)}
                            </ReactMarkdown>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                }

                return group.messages.map((msg) => (
                  <div key={msg._id} className="flex justify-start">
                    <Card
                      className={
                        msg.source === "council_error" || msg.source === "research_error"
                          ? "w-full max-w-2xl border-red-200 bg-red-50/50 shadow-sm"
                          : "max-w-full lg:max-w-2xl shadow-sm border-l-4 border-l-primary/40"
                      }
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                              {msg.model ? msg.model.split("/").pop() : "AI Council"}
                            </span>
                            {msg.round ? (
                              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                Round {msg.round}
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                            {new Date(msg._creationTime).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="prose prose-sm prose-agent max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ));
              })}
              {isWaitingForCouncil && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/80">
                      Responding...
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedModels.map((modelId, modelIdx) => (
                      <LoadingCard
                        key={`waiting-${modelId}`}
                        modelName={modelId}
                        colors={getAgentColorByIndex(modelIdx)}
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
          className="pointer-events-auto w-full max-w-4xl bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_1px_rgba(0,0,0,0.1)] border border-slate-200/80 p-4 flex flex-wrap items-center gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 shrink-0"
            onClick={startNewChat}
            disabled={isSubmitting}
          >
            New chat
          </Button>
          <ModelSelector
            value={selectedModels}
            onChange={setSelectedModels}
            disabled={isSubmitting}
          />
          {mode === "research" ? (
            <SingleModelSelector
              value={orchestratorModel}
              onChange={setOrchestratorModel}
              disabled={isSubmitting}
            />
          ) : null}
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as CouncilMode)}
            disabled={isSubmitting}
          >
            <SelectTrigger className="h-11 w-[140px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="parallel">Parallel Mode</SelectItem>
              <SelectItem value="conversation">Conversation Mode</SelectItem>
              <SelectItem value="research">Research Mode</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 shrink-0 text-sm text-slate-600">
            <span>{mode === "research" ? "Max rounds" : "Rounds"}</span>
            <Input
              type="number"
              min={1}
              max={5}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value) || 1)}
              disabled={isSubmitting}
              className="h-11 w-14"
            />
          </div>
          <Input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              mode === "research"
                ? "Message the research team..."
                : "Message the AI council..."
            }
            className="h-11 flex-1 min-w-[200px]"
            disabled={isSubmitting}
          />
          <Button
            type="submit"
            disabled={!message.trim() || isSubmitting}
            className="h-11 shrink-0"
          >
            {isSubmitting ? "Submitting..." : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
