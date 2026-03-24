import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelResponseBody } from "./ModelResponseBody";

vi.mock("@/components/messages/R3fLivePreview", () => ({
  R3fLivePreview: ({ code }: { code: string }) => (
    <div data-testid="r3f-live-mock">{code.trim().slice(0, 80)}</div>
  ),
}));

describe("ModelResponseBody", () => {
  it("renders SafeHtmlPreview iframe in preview mode when html artifact is present", () => {
    const content = `note\n\`\`\`html\n<div id="preview-body">hello-html</div>\n\`\`\``;
    render(<ModelResponseBody content={content} viewMode="preview" />);

    const iframe = screen.getByTitle("HTML preview");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("sandbox");
    expect(iframe.getAttribute("srcDoc")).toContain("preview-body");
    expect(iframe.getAttribute("srcDoc")).toContain("hello-html");
  });

  it("renders 3D preview in preview mode when r3f artifact is present", async () => {
    // Prefix line so extractMessageBody keeps the full ```r3f fence intact (same as real assistant messages).
    const content = `intro\n\`\`\`r3f\n<Canvas><mesh /></Canvas>\n\`\`\``;
    render(<ModelResponseBody content={content} viewMode="preview" />);

    await waitFor(() => {
      expect(screen.getByTestId("r3f-live-mock")).toBeInTheDocument();
    });
    expect(screen.getByTestId("r3f-live-mock").textContent).toContain("Canvas");
  });

  it("shows empty preview copy when preview mode has no artifacts", () => {
    render(<ModelResponseBody content="plain text only" viewMode="preview" />);
    expect(
      screen.getByText(/No HTML or React Three Fiber preview found in this response/i),
    ).toBeInTheDocument();
  });
});
