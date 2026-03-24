export type RenderArtifact =
  | {
      kind: "html";
      content: string;
    }
  | {
      kind: "r3f";
      content: string;
    };

function cleanFenceContent(content: string): string {
  return content.trim().replace(/^\uFEFF/, "");
}

function looksLikeHtml(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return (
    /<!doctype\s+html/i.test(trimmed) ||
    /<html[\s>]/i.test(trimmed) ||
    /<(body|main|section|article|div|h1|h2|h3|p|span|svg|canvas|style)\b/i.test(trimmed)
  );
}

/** Heuristic: TS/JSX block is intended for React Three Fiber preview (not generic React UI). */
function looksLikeR3fScene(content: string): boolean {
  const s = content.trim();
  if (!s) return false;
  if (/<Canvas\b/u.test(s)) return true;
  if (/@react-three\/fiber/u.test(s)) return true;
  if (
    /<mesh\b/u.test(s) &&
    /<(boxGeometry|sphereGeometry|planeGeometry|torusGeometry)\b/u.test(s)
  ) {
    return true;
  }
  return false;
}

export function extractRenderArtifacts(content: string): RenderArtifact[] {
  const artifacts: RenderArtifact[] = [];
  const seenHtml = new Set<string>();
  const seenR3f = new Set<string>();

  const pushHtml = (raw: string) => {
    const cleaned = cleanFenceContent(raw);
    if (!cleaned || seenHtml.has(cleaned)) return;
    seenHtml.add(cleaned);
    artifacts.push({ kind: "html", content: cleaned });
  };

  const pushR3f = (raw: string) => {
    const cleaned = cleanFenceContent(raw);
    if (!cleaned || seenR3f.has(cleaned)) return;
    seenR3f.add(cleaned);
    artifacts.push({ kind: "r3f", content: cleaned });
  };

  const r3fFence = /```r3f\s*([\s\S]*?)```/gi;
  for (const match of content.matchAll(r3fFence)) {
    const candidate = match[1] ?? "";
    if (candidate.trim()) {
      pushR3f(candidate);
    }
  }

  const tsxFence = /```(?:tsx|jsx)\s*([\s\S]*?)```/gi;
  for (const match of content.matchAll(tsxFence)) {
    const candidate = match[1] ?? "";
    if (looksLikeR3fScene(candidate)) {
      pushR3f(candidate);
    }
  }

  const htmlFence = /```(?:html|htm)\s*([\s\S]*?)```/gi;
  for (const match of content.matchAll(htmlFence)) {
    const candidate = match[1] ?? "";
    if (looksLikeHtml(candidate)) {
      pushHtml(candidate);
    }
  }

  if (!artifacts.some((a) => a.kind === "html")) {
    const genericFence = /```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi;
    for (const match of content.matchAll(genericFence)) {
      const candidate = match[1] ?? "";
      if (looksLikeHtml(candidate)) {
        pushHtml(candidate);
      }
    }
  }

  if (artifacts.length === 0 && looksLikeHtml(content)) {
    pushHtml(content);
  }

  return artifacts;
}
