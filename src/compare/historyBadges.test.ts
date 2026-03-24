import { describe, expect, it } from "vitest";
import { compareHistoryBadgeClass, formatCompareHistoryBadge } from "./historyBadges";
import type { CompareSessionListEntry } from "./types";

function entry(partial: CompareSessionListEntry): CompareSessionListEntry {
  return partial;
}

describe("formatCompareHistoryBadge", () => {
  it("returns Text for answer mode", () => {
    expect(formatCompareHistoryBadge(entry({ mode: "answer" }))).toBe("Text");
  });

  it("returns HTML or 3D for coding artifacts", () => {
    expect(formatCompareHistoryBadge(entry({ mode: "coding", codingArtifact: "html" }))).toBe(
      "HTML",
    );
    expect(formatCompareHistoryBadge(entry({ mode: "coding", codingArtifact: "react" }))).toBe(
      "3D",
    );
    expect(formatCompareHistoryBadge(entry({ mode: "coding", codingArtifact: "threejs" }))).toBe(
      "3D",
    );
  });

  it("returns Coding when coding mode has no artifact", () => {
    expect(formatCompareHistoryBadge(entry({ mode: "coding" }))).toBe("Coding");
  });
});

describe("compareHistoryBadgeClass", () => {
  it("uses amber for answer mode", () => {
    expect(compareHistoryBadgeClass(entry({ mode: "answer" }))).toContain("amber");
  });

  it("uses violet for 3D artifacts", () => {
    expect(compareHistoryBadgeClass(entry({ mode: "coding", codingArtifact: "react" }))).toContain(
      "violet",
    );
    expect(
      compareHistoryBadgeClass(entry({ mode: "coding", codingArtifact: "threejs" })),
    ).toContain("violet");
  });

  it("uses emerald for html coding", () => {
    expect(compareHistoryBadgeClass(entry({ mode: "coding", codingArtifact: "html" }))).toContain(
      "emerald",
    );
  });
});
