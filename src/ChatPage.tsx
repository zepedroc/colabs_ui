import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ChatPage() {
  const [message, setMessage] = useState("");
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random()}`);
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
    if (!message.trim()) return;

    const messageToSend = message;
    setMessage("");

    try {
      await sendMessage({
        content: messageToSend,
        sessionId,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessage(messageToSend); // Restore message on error
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-primary">AI Council Chat</h1>
        <p className="text-gray-600">Collaborate with multiple AI agents</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-lg">Start a conversation with the AI council</CardTitle>
                <CardDescription>
                  Ask questions and get collaborative insights from multiple AI agents.
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
                  className={`max-w-xs lg:max-w-md ${
                    msg.role === "user" ? "bg-primary border-primary text-white" : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="text-sm font-medium mb-1">
                      {msg.role === "user" ? "You" : "AI Council"}
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
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-white border-t p-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <Input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask the AI council anything..."
              className="flex-1 h-11"
            />
            <Button type="submit" disabled={!message.trim()} className="h-11">
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
