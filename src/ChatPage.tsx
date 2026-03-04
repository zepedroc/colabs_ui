import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
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
type CouncilMode = "parallel" | "conversation";

export function ChatPage() {
  const [message, setMessage] = useState("");
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
  const [rounds, setRounds] = useState(3);
  const [mode, setMode] = useState<CouncilMode>("parallel");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useQuery(api.chat.getMessages, { sessionId }) || [];
  const sendMessage = useMutation(api.chat.sendMessage);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-primary">AI Council Chat</h1>
        <p className="text-gray-600">Messages and FastAPI results are managed through Convex</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-lg">Start a conversation with the AI council</CardTitle>
                <CardDescription>
                  Convex stores messages and orchestrates FastAPI calls on your behalf.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center text-4xl pb-6">🤖</CardContent>
            </Card>
          ) : (
            messages.map((msg) => (
              <div
                key={msg._id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={
                    msg.role === "user"
                      ? "max-w-xs lg:max-w-md bg-primary border-primary text-white"
                      : msg.source === "fastapi_round"
                        ? "w-full border-blue-200"
                        : "max-w-xs lg:max-w-md"
                  }
                >
                  <CardContent className="p-4">
                    <div className="text-sm font-medium mb-1">
                      {msg.role === "user" ? "You" : msg.model ? msg.model : "AI Council"}
                      {msg.round ? (
                        <span className="ml-2 text-xs text-gray-500 align-middle">
                          Round {msg.round}
                        </span>
                      ) : null}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <div
                      className={`text-xs mt-2 ${
                        msg.role === "user" ? "text-blue-100" : "text-gray-500"
                      }`}
                    >
                      {new Date(msg._creationTime).toLocaleTimeString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))
          )}
          {requestError && (
            <Card className="border-red-300">
              <CardContent className="p-4 text-red-700">{requestError}</CardContent>
            </Card>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-white border-t p-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
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
              className="md:col-span-3 h-11"
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
