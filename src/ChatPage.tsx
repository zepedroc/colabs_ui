import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type CouncilMode = "parallel" | "conversation";

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

export function ChatPage() {
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const [rounds, setRounds] = useState(3);
  const [mode, setMode] = useState<CouncilMode>("parallel");
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
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Failed to send message.");
      setMessage(query);
    } finally {
      setIsSubmitting(false);
    }
  };

  const groups = groupMessages(messages);

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
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-lg">Start a conversation with the AI council</CardTitle>
                <CardDescription>
                  Convex stores messages and orchestrates AI council calls on your behalf.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center text-4xl pb-6">🤖</CardContent>
            </Card>
          ) : (
            filteredGroups.map((group) => {
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
                const title = group.type === "round" ? `Round ${group.round}` : "Final answers";
                const sortedMessages = [...group.messages].sort((a, b) =>
                  (a.model ?? "").localeCompare(b.model ?? ""),
                );
                const groupKey =
                  group.type === "round"
                    ? `round-${group.round}`
                    : `final-${group.messages.map((m) => m._id).join("-")}`;
                const isFinal = group.type === "final";
                return (
                  <div key={groupKey} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          isFinal
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-slate-100 text-slate-600 border border-slate-200/80"
                        }`}
                      >
                        {title}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sortedMessages.map((msg, idx) => {
                        const modelName = msg.model ?? "Unknown";
                        const colors = getAgentColorByIndex(idx);
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
                                {modelName.split("/").pop() ?? modelName}
                              </span>
                              <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                {new Date(msg._creationTime).toLocaleTimeString()}
                              </span>
                            </CardHeader>
                            <CardContent className="px-4 py-4">
                              <div
                                className={`text-sm prose prose-sm prose-agent max-w-none ${colors.accent} prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5 first:prose-p:mt-0`}
                              >
                                <ReactMarkdown>{body}</ReactMarkdown>
                              </div>
                            </CardContent>
                          </Card>
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
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ));
            })
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
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 shrink-0 text-sm text-slate-600">
            <span>Rounds</span>
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
            placeholder="Message the AI council..."
            className="h-11 flex-1 min-w-[200px]"
            disabled={isSubmitting}
          />
          <Button type="submit" disabled={!message.trim() || isSubmitting} className="h-11 shrink-0">
            {isSubmitting ? "Submitting..." : "Send"}
          </Button>
        </form>
      </div>
    </div>
  );
}
