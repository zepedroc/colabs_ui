import type { Doc, Id } from "../../../convex/_generated/dataModel";

let seq = 0;

const TEST_USER_ID = "jd7abc123456789012345678" as Id<"users">;

/**
 * Builds a minimal `Doc<"chatMessages">` for tests. Each call gets a unique `_id` unless overridden.
 */
export function makeChatMessage(
  partial: Partial<Doc<"chatMessages">> & Pick<Doc<"chatMessages">, "role" | "content">,
): Doc<"chatMessages"> {
  seq += 1;
  return {
    _id: `j${String(seq).padStart(30, "0")}msg` as Id<"chatMessages">,
    _creationTime: seq,
    userId: TEST_USER_ID,
    sessionId: "test-session",
    ...partial,
  };
}
