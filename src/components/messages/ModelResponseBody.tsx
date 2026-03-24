import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { MarkdownWithMath } from "@/components/MarkdownWithMath";
import { extractMessageBody } from "@/lib/messages/extractMessageBody";
import { extractRenderArtifacts } from "@/lib/messages/extractRenderArtifacts";
import { SafeHtmlPreview } from "./SafeHtmlPreview";

const R3fLivePreview = lazy(async () => {
  const m = await import("./R3fLivePreview");
  return { default: m.R3fLivePreview };
});

export type ResponseViewMode = "response" | "preview";

type ModelResponseBodyProps = {
  content: string;
  viewMode: ResponseViewMode;
  className?: string;
};

export function ModelResponseBody({ content, viewMode, className }: ModelResponseBodyProps) {
  const body = extractMessageBody(content);
  const artifacts = extractRenderArtifacts(body);
  const r3fArtifact = artifacts.find((artifact) => artifact.kind === "r3f");
  const htmlArtifact = artifacts.find((artifact) => artifact.kind === "html");

  if (viewMode === "preview") {
    if (r3fArtifact) {
      return (
        <Suspense
          fallback={
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-8 text-center text-xs text-slate-600">
              Loading 3D preview…
            </div>
          }
        >
          <R3fLivePreview code={r3fArtifact.content} />
        </Suspense>
      );
    }
    if (htmlArtifact) {
      return <SafeHtmlPreview html={htmlArtifact.content} />;
    }
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-600">
        No HTML or React Three Fiber preview found in this response.
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      <MarkdownWithMath>{body}</MarkdownWithMath>
    </div>
  );
}
