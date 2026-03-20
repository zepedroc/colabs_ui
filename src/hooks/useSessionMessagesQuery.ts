import { useRef } from "react";
import type { Doc } from "../../convex/_generated/dataModel";

/**
 * Convex `useQuery` is `undefined` while the subscription for the new args is loading.
 * Coercing with `?? []` makes the UI treat that as an empty chat.
 *
 * We must detect `sessionId` changes during render (refs), not in `useEffect`: effects run
 * after paint, so the first frame would still have `messages === []` and no loading flag —
 * a visible empty-state flicker (especially on Compare’s simpler empty layout).
 */
export function useSessionMessagesQuery(
  sessionId: string,
  queryResult: Doc<"chatMessages">[] | undefined,
): { messages: Doc<"chatMessages">[]; isSwitchLoading: boolean } {
  const prevSessionIdRef = useRef(sessionId);
  const awaitingDataForSessionRef = useRef(false);

  if (prevSessionIdRef.current !== sessionId) {
    awaitingDataForSessionRef.current = true;
    prevSessionIdRef.current = sessionId;
  }

  if (queryResult !== undefined) {
    awaitingDataForSessionRef.current = false;
  }

  const isSwitchLoading = queryResult === undefined && awaitingDataForSessionRef.current;
  const messages = queryResult ?? [];

  return { messages, isSwitchLoading };
}
