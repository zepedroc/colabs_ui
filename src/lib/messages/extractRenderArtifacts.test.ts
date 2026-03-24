import { describe, expect, it } from "vitest";
import { extractRenderArtifacts } from "./extractRenderArtifacts";

describe("extractRenderArtifacts", () => {
  it("extracts html from fenced html blocks", () => {
    const content = `intro\n\`\`\`html\n<div>artifact</div>\n\`\`\``;
    const artifacts = extractRenderArtifacts(content);
    expect(
      artifacts.some((a) => a.kind === "html" && a.content.includes("<div>artifact</div>")),
    ).toBe(true);
  });

  it("extracts r3f from fenced r3f blocks", () => {
    const scene = "<Canvas><mesh /></Canvas>";
    const content = `x\n\`\`\`r3f\n${scene}\n\`\`\``;
    const artifacts = extractRenderArtifacts(content);
    expect(artifacts.some((a) => a.kind === "r3f" && a.content.includes("Canvas"))).toBe(true);
  });

  it("classifies tsx fences as r3f when the scene looks like R3F", () => {
    const content = `\`\`\`tsx
import { Canvas } from "@react-three/fiber";
export function Scene() { return <Canvas />; }
\`\`\``;
    const artifacts = extractRenderArtifacts(content);
    expect(artifacts.some((a) => a.kind === "r3f")).toBe(true);
  });

  it("returns html when the whole body looks like HTML (no fence)", () => {
    const content = '<div class="standalone">ok</div>';
    const artifacts = extractRenderArtifacts(content);
    expect(artifacts.some((a) => a.kind === "html")).toBe(true);
  });
});
