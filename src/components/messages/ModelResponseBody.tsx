import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { extractMessageBody } from "@/lib/messages/extractMessageBody";
import { extractRenderArtifacts } from "@/lib/messages/extractRenderArtifacts";
import { SafeHtmlPreview } from "./SafeHtmlPreview";

export type ResponseViewMode = "response" | "preview";

type ModelResponseBodyProps = {
  content: string;
  viewMode: ResponseViewMode;
  className?: string;
};

export function ModelResponseBody({ content, viewMode, className }: ModelResponseBodyProps) {
  const body = extractMessageBody(content);
  const artifacts = extractRenderArtifacts(body);
  const htmlArtifact = artifacts.find((artifact) => artifact.kind === "html");

  if (viewMode === "preview") {
    if (!htmlArtifact) {
      return (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-600">
          No HTML preview found in this response.
        </div>
      );
    }
    return <SafeHtmlPreview html={htmlArtifact.content} />;
  }

  return (
    <div className={cn(className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
