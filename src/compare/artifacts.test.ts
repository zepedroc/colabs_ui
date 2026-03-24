import { describe, expect, it } from "vitest";
import { normalizeCodingArtifact } from "./artifacts";

describe("normalizeCodingArtifact", () => {
  it("maps react and threejs to react", () => {
    expect(normalizeCodingArtifact("react")).toBe("react");
    expect(normalizeCodingArtifact("threejs")).toBe("react");
  });

  it("maps html and undefined to html", () => {
    expect(normalizeCodingArtifact("html")).toBe("html");
    expect(normalizeCodingArtifact(undefined)).toBe("html");
  });
});
