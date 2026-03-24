import { extractMessageBody } from "@/lib/messages/extractMessageBody";
import type { Doc } from "../../convex/_generated/dataModel";
import type { MessageGroup } from "./types";

export function groupMessages(messages: Doc<"chatMessages">[]): MessageGroup[] {
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

export function isFinalSameAsLastRound(
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

/** Hides `final` groups that duplicate the preceding round’s content per model (same UX as showing the round only). */
export function filterRedundantFinalGroups(groups: MessageGroup[]): MessageGroup[] {
  return groups.filter((group, idx) => {
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
}
