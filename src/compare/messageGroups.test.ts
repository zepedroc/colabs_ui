import { describe, expect, it } from "vitest";
import { makeChatMessage } from "@/test/fixtures/chatMessages";
import { filterRedundantFinalGroups, groupMessages, isFinalSameAsLastRound } from "./messageGroups";

describe("groupMessages", () => {
  it("groups consecutive council_round messages with the same round into one round group", () => {
    const m0 = makeChatMessage({
      role: "user",
      content: "Hello",
      source: "user",
    });
    const m1 = makeChatMessage({
      role: "assistant",
      content: "body\nA",
      source: "council_round",
      round: 1,
      model: "model-a",
    });
    const m2 = makeChatMessage({
      role: "assistant",
      content: "body\nB",
      source: "council_round",
      round: 1,
      model: "model-b",
    });
    const groups = groupMessages([m0, m1, m2]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ type: "user", messages: [m0] });
    expect(groups[1]).toEqual({ type: "round", round: 1, messages: [m1, m2] });
  });

  it("starts a new round group when round number changes", () => {
    const u = makeChatMessage({ role: "user", content: "q", source: "user" });
    const r1a = makeChatMessage({
      role: "assistant",
      content: "r1",
      source: "council_round",
      round: 1,
      model: "a",
    });
    const r2a = makeChatMessage({
      role: "assistant",
      content: "r2",
      source: "council_round",
      round: 2,
      model: "a",
    });
    const groups = groupMessages([u, r1a, r2a]);
    expect(groups).toHaveLength(3);
    expect(groups[1]).toMatchObject({ type: "round", round: 1 });
    expect(groups[2]).toMatchObject({ type: "round", round: 2 });
  });

  it("merges consecutive council_final messages into one final group", () => {
    const u = makeChatMessage({ role: "user", content: "q", source: "user" });
    const f1 = makeChatMessage({
      role: "assistant",
      content: "final-a",
      source: "council_final",
      model: "a",
    });
    const f2 = makeChatMessage({
      role: "assistant",
      content: "final-b",
      source: "council_final",
      model: "b",
    });
    const groups = groupMessages([u, f1, f2]);
    expect(groups).toHaveLength(2);
    expect(groups[1]).toEqual({ type: "final", messages: [f1, f2] });
  });

  it("emits a single group for non-round non-final assistant messages", () => {
    const u = makeChatMessage({ role: "user", content: "q", source: "user" });
    const s = makeChatMessage({
      role: "assistant",
      content: "solo",
      source: "research_orchestrator",
    });
    const groups = groupMessages([u, s]);
    expect(groups).toHaveLength(2);
    expect(groups[1]).toEqual({ type: "single", messages: [s] });
  });

  it("breaks assistant groups on user messages", () => {
    const u1 = makeChatMessage({ role: "user", content: "one", source: "user" });
    const a1 = makeChatMessage({
      role: "assistant",
      content: "a",
      source: "council_round",
      round: 1,
      model: "x",
    });
    const u2 = makeChatMessage({ role: "user", content: "two", source: "user" });
    const groups = groupMessages([u1, a1, u2]);
    expect(groups.map((g) => g.type)).toEqual(["user", "round", "user"]);
  });
});

describe("isFinalSameAsLastRound", () => {
  it("returns true when each model’s extracted body matches the round", () => {
    const roundGroup = {
      type: "round" as const,
      round: 1,
      messages: [
        makeChatMessage({
          role: "assistant",
          content: "prefix\nsame",
          source: "council_round",
          round: 1,
          model: "m1",
        }),
        makeChatMessage({
          role: "assistant",
          content: "other\nsame",
          source: "council_round",
          round: 1,
          model: "m2",
        }),
      ],
    };
    const finalGroup = {
      type: "final" as const,
      messages: [
        makeChatMessage({
          role: "assistant",
          content: "x\nsame",
          source: "council_final",
          model: "m1",
        }),
        makeChatMessage({
          role: "assistant",
          content: "y\nsame",
          source: "council_final",
          model: "m2",
        }),
      ],
    };
    expect(isFinalSameAsLastRound(finalGroup, roundGroup)).toBe(true);
  });

  it("returns false when a model body differs", () => {
    const roundGroup = {
      type: "round" as const,
      round: 1,
      messages: [
        makeChatMessage({
          role: "assistant",
          content: "a",
          source: "council_round",
          round: 1,
          model: "m1",
        }),
      ],
    };
    const finalGroup = {
      type: "final" as const,
      messages: [
        makeChatMessage({
          role: "assistant",
          content: "b",
          source: "council_final",
          model: "m1",
        }),
      ],
    };
    expect(isFinalSameAsLastRound(finalGroup, roundGroup)).toBe(false);
  });

  it("returns false when lastRound is null", () => {
    const finalGroup = {
      type: "final" as const,
      messages: [
        makeChatMessage({
          role: "assistant",
          content: "x",
          source: "council_final",
          model: "m1",
        }),
      ],
    };
    expect(isFinalSameAsLastRound(finalGroup, null)).toBe(false);
  });
});

describe("filterRedundantFinalGroups", () => {
  it("removes a final group that duplicates the previous round", () => {
    const u = makeChatMessage({ role: "user", content: "q", source: "user" });
    const r1 = makeChatMessage({
      role: "assistant",
      content: "body\nsame",
      source: "council_round",
      round: 1,
      model: "a",
    });
    const r2 = makeChatMessage({
      role: "assistant",
      content: "body\nsame",
      source: "council_round",
      round: 1,
      model: "b",
    });
    const f1 = makeChatMessage({
      role: "assistant",
      content: "x\nsame",
      source: "council_final",
      model: "a",
    });
    const f2 = makeChatMessage({
      role: "assistant",
      content: "y\nsame",
      source: "council_final",
      model: "b",
    });
    const groups = groupMessages([u, r1, r2, f1, f2]);
    const filtered = filterRedundantFinalGroups(groups);
    expect(filtered.map((g) => g.type)).toEqual(["user", "round"]);
  });

  it("keeps final when content differs from the round", () => {
    const u = makeChatMessage({ role: "user", content: "q", source: "user" });
    const r1 = makeChatMessage({
      role: "assistant",
      content: "round-only",
      source: "council_round",
      round: 1,
      model: "a",
    });
    const f1 = makeChatMessage({
      role: "assistant",
      content: "final-different",
      source: "council_final",
      model: "a",
    });
    const groups = groupMessages([u, r1, f1]);
    const filtered = filterRedundantFinalGroups(groups);
    expect(filtered.map((g) => g.type)).toEqual(["user", "round", "final"]);
  });

  it("keeps final when there is no preceding round in the list", () => {
    const f1 = makeChatMessage({
      role: "assistant",
      content: "only-final",
      source: "council_final",
      model: "a",
    });
    const groups = groupMessages([f1]);
    const filtered = filterRedundantFinalGroups(groups);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.type).toBe("final");
  });
});
