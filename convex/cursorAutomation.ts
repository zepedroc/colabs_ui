"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { getCursorApiKey, getCursorRepository } from "./cursorAutomationConfig";

const cursorAgentRef = v.union(v.literal("dev"), v.literal("main"));
const cursorAgentModel = v.union(
  v.literal("composer-1.5"),
  v.literal("claude-4.6-opus-high-thinking"),
  v.literal("gemini-3.1-pro-preview"),
  v.literal("gpt-5.4-high"),
  v.literal("gpt-5.3-codex-high"),
);

const cursorAgentLaunchResult = v.object({
  id: v.string(),
  status: v.optional(v.string()),
  url: v.optional(v.string()),
  prUrl: v.optional(v.string()),
});

type CursorAgentResponse = {
  id?: string;
  status?: string;
  target?: {
    url?: string;
    prUrl?: string;
  };
};

function buildCursorPrompt(title: string, description?: string, additionalPrompt?: string): string {
  const trimmedTitle = title.trim();
  const trimmedDescription = description?.trim();
  const trimmedAdditionalPrompt = additionalPrompt?.trim();
  const sections = ["Implement the following ticket:", `Title: ${trimmedTitle}`];

  if (trimmedDescription) {
    sections.push(`Description: ${trimmedDescription}`);
  }

  if (trimmedAdditionalPrompt) {
    sections.push(`Additional instructions: ${trimmedAdditionalPrompt}`);
  }

  return sections.join("\n");
}

export const launchTaskAgent = internalAction({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    ref: cursorAgentRef,
    model: cursorAgentModel,
    additionalPrompt: v.optional(v.string()),
  },
  returns: cursorAgentLaunchResult,
  handler: async (_ctx, args) => {
    const apiKey = getCursorApiKey();
    const response = await fetch("https://api.cursor.com/v0/agents", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: buildCursorPrompt(args.title, args.description, args.additionalPrompt),
        },
        source: {
          repository: getCursorRepository(),
          ref: args.ref,
        },
        target: {
          autoCreatePr: true,
        },
        model: args.model,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cursor agent launch failed (${response.status} ${response.statusText}): ${errorText}`,
      );
    }

    const data = (await response.json()) as CursorAgentResponse;

    if (!data.id) {
      throw new Error("Cursor agent launch succeeded but no agent id was returned.");
    }

    return {
      id: data.id,
      status: data.status,
      url: data.target?.url,
      prUrl: data.target?.prUrl,
    };
  },
});
