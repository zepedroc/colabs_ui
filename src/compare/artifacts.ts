import type { CompareCodingArtifact, StoredCompareCodingArtifact } from "./types";

/**
 * Map stored Convex artifacts onto the two UI tabs. `threejs` and `react` both select 3D (R3F).
 */
export function normalizeCodingArtifact(
  artifact: StoredCompareCodingArtifact | undefined,
): CompareCodingArtifact {
  if (artifact === "react" || artifact === "threejs") {
    return "react";
  }
  if (artifact === "html") {
    return "html";
  }
  return "html";
}
