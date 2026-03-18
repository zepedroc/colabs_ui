export function extractMessageBody(content: string): string {
  const lines = content.split("\n");
  if (lines.length > 1) {
    return lines.slice(1).join("\n").trim() || content;
  }
  return content;
}
