import type { CompareSessionListEntry } from "./types";

export function formatCompareHistoryBadge(session: CompareSessionListEntry): string {
  if (session.mode === "image") {
    return "Image";
  }
  if (session.mode !== "coding") {
    return "Text";
  }
  switch (session.codingArtifact) {
    case "react":
    case "threejs":
      return "3D";
    case "html":
      return "HTML";
    default:
      return "Coding";
  }
}

export function compareHistoryBadgeClass(session: CompareSessionListEntry): string {
  if (session.mode === "image") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (session.mode !== "coding") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  switch (session.codingArtifact) {
    case "react":
    case "threejs":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "html":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}
