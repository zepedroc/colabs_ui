export type RenderArtifact = {
  kind: "html";
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

export function extractRenderArtifacts(content: string): RenderArtifact[] {
  const artifacts: RenderArtifact[] = [];
  const seenHtml = new Set<string>();

  const pushHtml = (raw: string) => {
    const cleaned = cleanFenceContent(raw);
    if (!cleaned || seenHtml.has(cleaned)) return;
    seenHtml.add(cleaned);
    artifacts.push({ kind: "html", content: cleaned });
  };

  const htmlFence = /```(?:html|htm)\s*([\s\S]*?)```/gi;
  for (const match of content.matchAll(htmlFence)) {
    const candidate = match[1] ?? "";
    if (looksLikeHtml(candidate)) {
      pushHtml(candidate);
    }
  }

  if (artifacts.length === 0) {
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
