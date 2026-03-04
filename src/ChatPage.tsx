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
    border: "border-blue-500",
    bg: "bg-blue-50",
    accent: "text-blue-700",
    label: "bg-blue-100 text-blue-800",
  },
  {
    border: "border-emerald-500",
    bg: "bg-emerald-50",
    accent: "text-emerald-700",
    label: "bg-emerald-100 text-emerald-800",
  },
  {
    border: "border-amber-500",
    bg: "bg-amber-50",
    accent: "text-amber-700",
    label: "bg-amber-100 text-amber-800",
  },
  {
    border: "border-violet-500",
    bg: "bg-violet-50",
    accent: "text-violet-700",
    label: "bg-violet-100 text-violet-800",
  },
  {
    border: "border-rose-500",
    bg: "bg-rose-50",
    accent: "text-rose-700",
    label: "bg-rose-100 text-rose-800",
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
      <div className="bg-white border-b px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold text-primary">AI Council Chat</h1>
        <p className="text-gray-600">Messages and AI results are managed through Convex</p>
      </div>

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
                          <div className="text-xs text-blue-100 shrink-0">
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
                return (
                  <div key={groupKey}>
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">{title}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sortedMessages.map((msg, idx) => {
                        const modelName = msg.model ?? "Unknown";
                        const colors = getAgentColorByIndex(idx);
                        const body = extractMessageBody(msg.content);
                        return (
                          <Card
                            key={msg._id}
                            className={`${colors.border} border-l-4 ${colors.bg} min-w-0`}
                          >
                            <CardHeader className="py-2 px-4 flex flex-row justify-between items-start gap-2">
                              <div
                                className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit ${colors.label}`}
                              >
                                {modelName.split("/").pop() ?? modelName}
                              </div>
                              <div className="text-xs text-gray-500 shrink-0">
                                {new Date(msg._creationTime).toLocaleTimeString()}
                              </div>
                            </CardHeader>
                            <CardContent className="px-4 pb-4 pt-0">
                              <div
                                className={`text-sm prose prose-sm max-w-none ${colors.accent} prose-p:my-1 prose-ul:my-1 prose-ol:my-1`}
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
                        ? "w-full border-red-200 bg-red-50"
                        : "max-w-xs lg:max-w-md"
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <div className="text-sm font-medium">
                          {msg.model ? msg.model : "AI Council"}
                          {msg.round ? (
                            <span className="ml-2 text-xs text-gray-500 align-middle">
                              Round {msg.round}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-500 shrink-0">
                          {new Date(msg._creationTime).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ));
            })
          )}
          {requestError && (
            <Card className="border-red-300">
              <CardContent className="p-4 text-red-700">{requestError}</CardContent>
            </Card>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_3fr_auto] gap-3 items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11"
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
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parallel">parallel</SelectItem>
                <SelectItem value="conversation">conversation</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              max={5}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value) || 1)}
              disabled={isSubmitting}
              className="h-11"
            />
            <Input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask the AI council anything..."
              className="h-11"
              disabled={isSubmitting}
            />
            <Button type="submit" disabled={!message.trim() || isSubmitting} className="h-11">
              {isSubmitting ? "Submitting..." : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
