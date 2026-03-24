import type { Doc } from "../../convex/_generated/dataModel";

export type CompareGenerationMode = "answer" | "coding" | "image";

/** Values the compare UI exposes (HTML vs one 3D mode backed by R3F / `react` in Convex). */
export type CompareCodingArtifact = "html" | "react";

/** Persisted `generation.artifact`; `threejs` is normalized to the same 3D tab as `react`. */
export type StoredCompareCodingArtifact = "html" | "react" | "threejs";

export type CompareSessionListEntry = {
  mode: CompareGenerationMode;
  codingArtifact?: StoredCompareCodingArtifact;
};

export type MessageGroup =
  | { type: "user"; messages: Doc<"chatMessages">[] }
  | { type: "round"; round: number; messages: Doc<"chatMessages">[] }
  | { type: "final"; messages: Doc<"chatMessages">[] }
  | { type: "single"; messages: Doc<"chatMessages">[] };
