import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMPARE_MODELS } from "@/compare/constants";
import { getModelShortName } from "@/lib/modelDisplay";
import { makeChatMessage } from "@/test/fixtures/chatMessages";
import { ComparePage } from "./ComparePage";

const FREE_MODELS_FOR_SELECTOR = [
  { id: "stepfun/step-3.5-flash:free", name: "step-3.5-flash:free" },
  { id: "arcee-ai/trinity-large-preview:free", name: "trinity-large-preview:free" },
  { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "nemotron-3-nano-30b-a3b:free" },
];

vi.mock("@/hooks/useFreeModels", () => ({
  useFreeModels: () => ({
    models: FREE_MODELS_FOR_SELECTOR,
    loading: false,
    error: null,
  }),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => vi.fn()),
    useAction: vi.fn(() => vi.fn().mockResolvedValue(FREE_MODELS_FOR_SELECTOR)),
  };
});

import { useMutation, useQuery } from "convex/react";

const mockUseQuery = vi.mocked(useQuery);
const mockUseMutation = vi.mocked(useMutation);

function setupDefaultQueries(messages: ReturnType<typeof makeChatMessage>[] = []) {
  mockUseQuery.mockImplementation((fn) => {
    const name = getFunctionName(fn as never);
    if (name === "chat:getMessages") {
      return messages;
    }
    if (name === "compare:listSessions") {
      return [];
    }
    return undefined;
  });
}

describe("ComparePage", () => {
  beforeEach(() => {
    mockUseMutation.mockReset();
    mockUseMutation.mockImplementation((fn) => {
      const name = getFunctionName(fn as never);
      if (name === "compare:sendMessage" || name === "compare:deleteSession") {
        return vi.fn().mockResolvedValue(undefined);
      }
      return vi.fn().mockResolvedValue(undefined);
    });
    mockUseQuery.mockReset();
    setupDefaultQueries([]);
  });

  it("shows empty state copy and starter prompt fills the input", async () => {
    const user = userEvent.setup();
    render(<ComparePage />);

    expect(
      screen.getByRole("heading", { name: /Compare models side by side/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Explain recursion with a simple example" }),
    );
    const input = screen.getByPlaceholderText(/Ask a question to compare/i);
    expect(input).toHaveValue("Explain recursion with a simple example");
  });

  it("submits compare with trimmed content and answer generation", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    mockUseMutation.mockImplementation((fn) => {
      const name = getFunctionName(fn as never);
      if (name === "compare:sendMessage") {
        return sendMessage;
      }
      return vi.fn().mockResolvedValue(undefined);
    });

    const user = userEvent.setup();
    render(<ComparePage />);

    const input = screen.getByPlaceholderText(/Ask a question to compare/i);
    await user.type(input, "  hello world  ");
    await waitFor(() => {
      expect(input).toHaveValue("  hello world  ");
    });
    await user.click(screen.getByRole("button", { name: /^Compare$/ }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const payload = sendMessage.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      content: "hello world",
      models: DEFAULT_COMPARE_MODELS,
      generation: { mode: "answer", artifact: "none" },
    });
    expect(payload?.sessionId).toMatch(/^compare-/);
  });

  it("sends coding generation with html artifact when coding mode is selected", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    mockUseMutation.mockImplementation((fn) => {
      const name = getFunctionName(fn as never);
      if (name === "compare:sendMessage") {
        return sendMessage;
      }
      return vi.fn().mockResolvedValue(undefined);
    });

    const user = userEvent.setup();
    render(<ComparePage />);

    await user.click(screen.getByRole("tab", { name: "Coding" }));
    const input = screen.getByPlaceholderText(/HTML visualization/i);
    await user.type(input, "draw a chart");
    await user.click(screen.getByRole("button", { name: /^Compare$/ }));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "draw a chart",
        generation: { mode: "coding", artifact: "html" },
      }),
    );
  });

  it("restores message and shows error when send fails", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("upstream error"));
    mockUseMutation.mockImplementation((fn) => {
      const name = getFunctionName(fn as never);
      if (name === "compare:sendMessage") {
        return sendMessage;
      }
      return vi.fn().mockResolvedValue(undefined);
    });

    const user = userEvent.setup();
    render(<ComparePage />);

    const input = screen.getByPlaceholderText(/Ask a question to compare/i);
    await user.type(input, "will fail");
    await user.click(screen.getByRole("button", { name: /^Compare$/ }));

    expect(screen.getByText("upstream error")).toBeInTheDocument();
    expect(input).toHaveValue("will fail");
  });

  it("shows responding placeholders when the last message is from the user", async () => {
    const userMsg = makeChatMessage({
      role: "user",
      content: "still waiting",
      source: "user",
    });
    setupDefaultQueries([userMsg]);

    render(<ComparePage />);

    await waitFor(() => {
      expect(screen.getByText("Responding...")).toBeInTheDocument();
    });
    const shortA = getModelShortName(DEFAULT_COMPARE_MODELS[0]);
    const shortB = getModelShortName(DEFAULT_COMPARE_MODELS[1]);
    expect(screen.getByText(shortA)).toBeInTheDocument();
    expect(screen.getByText(shortB)).toBeInTheDocument();
  });

  it("enables Preview and renders HTML iframes after switching to preview in a coding round", async () => {
    const user = userEvent.setup();
    const userMsg = makeChatMessage({
      role: "user",
      content: "build a chart",
      source: "user",
      generationMode: "coding",
    });
    const assistantA = makeChatMessage({
      role: "assistant",
      content: `ok\n\`\`\`html\n<div id="col-a">Alpha</div>\n\`\`\``,
      source: "council_round",
      round: 1,
      model: DEFAULT_COMPARE_MODELS[0],
    });
    const assistantB = makeChatMessage({
      role: "assistant",
      content: `ok\n\`\`\`html\n<div id="col-b">Beta</div>\n\`\`\``,
      source: "council_round",
      round: 1,
      model: DEFAULT_COMPARE_MODELS[1],
    });
    setupDefaultQueries([userMsg, assistantA, assistantB]);

    render(<ComparePage />);

    const previewTab = screen.getByRole("tab", { name: "Preview" });
    expect(previewTab).not.toBeDisabled();

    await user.click(previewTab);

    const iframes = screen.getAllByTitle("HTML preview");
    expect(iframes).toHaveLength(2);
    const srcDocs = iframes.map((el) => el.getAttribute("srcDoc") ?? "");
    expect(srcDocs.some((doc) => doc.includes("col-a"))).toBe(true);
    expect(srcDocs.some((doc) => doc.includes("col-b"))).toBe(true);
  });
});
