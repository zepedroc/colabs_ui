import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeChatMessage } from "@/test/fixtures/chatMessages";
import { useSessionMessagesQuery } from "./useSessionMessagesQuery";

describe("useSessionMessagesQuery", () => {
  it("returns empty messages and not loading when query is undefined on first mount", () => {
    const { result } = renderHook(() => useSessionMessagesQuery("session-a", undefined));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isSwitchLoading).toBe(false);
  });

  it("sets isSwitchLoading when sessionId changes and query is still undefined", () => {
    const { result, rerender } = renderHook(
      ({
        sessionId,
        query,
      }: {
        sessionId: string;
        query: ReturnType<typeof makeChatMessage>[] | undefined;
      }) => useSessionMessagesQuery(sessionId, query),
      {
        initialProps: {
          sessionId: "s1",
          query: [] as ReturnType<typeof makeChatMessage>[] | undefined,
        },
      },
    );

    expect(result.current.isSwitchLoading).toBe(false);

    rerender({ sessionId: "s2", query: undefined });
    expect(result.current.isSwitchLoading).toBe(true);
    expect(result.current.messages).toEqual([]);
  });

  it("clears isSwitchLoading when query resolves including empty array", () => {
    const { result, rerender } = renderHook(
      ({
        sessionId,
        query,
      }: {
        sessionId: string;
        query: ReturnType<typeof makeChatMessage>[] | undefined;
      }) => useSessionMessagesQuery(sessionId, query),
      {
        initialProps: {
          sessionId: "s1",
          query: undefined as ReturnType<typeof makeChatMessage>[] | undefined,
        },
      },
    );

    rerender({ sessionId: "s2", query: undefined });
    expect(result.current.isSwitchLoading).toBe(true);

    rerender({ sessionId: "s2", query: [] });
    expect(result.current.isSwitchLoading).toBe(false);
    expect(result.current.messages).toEqual([]);
  });

  it("returns messages from query when defined", () => {
    const m = makeChatMessage({ role: "user", content: "hi", source: "user" });
    const { result } = renderHook(() => useSessionMessagesQuery("s1", [m]));
    expect(result.current.messages).toEqual([m]);
    expect(result.current.isSwitchLoading).toBe(false);
  });
});
