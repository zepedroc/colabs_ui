import { v } from "convex/values";

export type GenerationMode = "answer" | "coding";
export type GenerationArtifact = "none" | "html" | "threejs" | "react";

export type GenerationSettings = {
  mode: GenerationMode;
  artifact: GenerationArtifact;
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  mode: "answer",
  artifact: "none",
};

export const generationModeValidator = v.union(v.literal("answer"), v.literal("coding"));
export const generationArtifactValidator = v.union(
  v.literal("none"),
  v.literal("html"),
  v.literal("threejs"),
  v.literal("react"),
);
export const generationSettingsValidator = v.object({
  mode: generationModeValidator,
  artifact: generationArtifactValidator,
});

export function normalizeGenerationSettings(
  generation: GenerationSettings | undefined,
): GenerationSettings {
  if (!generation) {
    return DEFAULT_GENERATION_SETTINGS;
  }
  if (generation.mode === "coding") {
    return {
      mode: "coding",
      artifact: generation.artifact === "none" ? "html" : generation.artifact,
    };
  }
  return DEFAULT_GENERATION_SETTINGS;
}
