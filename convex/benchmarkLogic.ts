/**
 * Benchmark logic - run council per case, parse JSON selections, stream NDJSON.
 */

import { type CouncilMode, type ModelResponse, queryCouncilStream } from "./council";

export interface BenchmarkCase {
  question: string;
  options: Record<string, string>;
  expected_option: string;
}

export type BenchmarkAnswerStatus = "correct" | "incorrect" | "parsing_error";

export interface ModelBenchmarkResult {
  model: string;
  round1_raw_response: string | null;
  final_raw_response: string | null;
  round1_option: string | null;
  final_option: string | null;
  round1_correct: boolean;
  final_correct: boolean;
  round1_status: BenchmarkAnswerStatus;
  final_status: BenchmarkAnswerStatus;
  round1_parse_error: string | null;
  final_parse_error: string | null;
}

export interface BenchmarkCaseResult {
  case_index: number;
  question: string;
  expected_option: string;
  model_results: ModelBenchmarkResult[];
}

export interface BenchmarkSummary {
  total_cases: number;
  round1_correct: number;
  final_correct: number;
  round1_accuracy: number;
  final_accuracy: number;
  delta: number;
}

const BENCHMARK_QUERY_TEMPLATE =
  "You are answering a multiple-choice question. Choose exactly one option.\n\n" +
  "Question:\n{question}\n\n" +
  "Options:\n{options_text}\n\n" +
  "You MUST respond with ONLY a valid JSON object (no markdown, no extra text) with this exact structure:\n" +
  '{"selected_option": "A", "reason": "your brief reasoning"}\n\n' +
  "The selected_option must be one of: {option_labels}";

function buildBenchmarkQuery(case_: BenchmarkCase): string {
  const lines = Object.entries(case_.options)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, text]) => `${label}: ${text}`);
  const optionsText = lines.join("\n");
  const optionLabels = Object.keys(case_.options).sort().join(", ");
  return BENCHMARK_QUERY_TEMPLATE.replace("{question}", case_.question)
    .replace("{options_text}", optionsText)
    .replace("{option_labels}", optionLabels);
}

function normalizeOption(s: string): string {
  return (s ?? "").trim().toUpperCase();
}

function parseChoiceOutput(content: string | null): [string | null, string | null] {
  if (!content || !content.trim()) {
    return [null, "Empty response"];
  }
  let text = content.trim();
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[0]?.startsWith("```")) {
      lines.shift();
    }
    if (lines.length > 0 && lines[lines.length - 1]?.trim() === "```") {
      lines.pop();
    }
    text = lines.join("\n");
  }
  try {
    const data = JSON.parse(text) as unknown;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return [null, "Invalid JSON object: expected a JSON object"];
    }
    const obj = data as Record<string, unknown>;
    const selectedOption = obj.selected_option;
    if (typeof selectedOption !== "string") {
      return [null, "Validation error: selected_option must be a string"];
    }
    return [normalizeOption(selectedOption), null];
  } catch (e) {
    return [null, `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`];
  }
}

function benchmarkAnswerStatus(
  selectedOption: string | null,
  parseError: string | null,
  expectedOption: string,
): BenchmarkAnswerStatus {
  if (
    parseError != null &&
    (parseError === "Empty response" || parseError.startsWith("Invalid JSON"))
  ) {
    return "parsing_error";
  }
  if (selectedOption === expectedOption) {
    return "correct";
  }
  return "incorrect";
}

/**
 * Run benchmark: run council per case, parse JSON selections,
 * score round1 vs final, yield NDJSON events.
 */
export async function* runBenchmarkStream(
  apiKey: string,
  models: string[],
  cases: BenchmarkCase[],
  rounds: number,
  mode: CouncilMode,
): AsyncGenerator<string> {
  let totalRound1Correct = 0;
  let totalFinalCorrect = 0;
  const totalAnswers = cases.length * models.length;
  const expectedNormalized = normalizeOption;

  for (let caseIdx = 0; caseIdx < cases.length; caseIdx++) {
    const case_ = cases[caseIdx];
    const questionPreview =
      case_.question.length > 100 ? `${case_.question.slice(0, 100)}...` : case_.question;

    yield `${JSON.stringify({
      type: "benchmark_case_started",
      case_index: caseIdx,
      question: questionPreview,
    })}\n`;

    const query = buildBenchmarkQuery(case_);
    const expected = expectedNormalized(case_.expected_option);

    const round1ByModel: Record<string, ModelResponse> = {};
    let finalResponses: ModelResponse[] = [];

    for await (const line of queryCouncilStream(apiKey, models, query, rounds, mode)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed) as Record<string, unknown>;
        if (ev.type === "round_response") {
          const r = ev.round as number | undefined;
          const model = (ev.model as string) ?? "";
          const content = ev.content as string | null | undefined;
          const err = ev.error as string | null | undefined;
          const resp: ModelResponse = {
            model,
            content: content ?? null,
            error: err ?? null,
          };
          if (r === 1) {
            round1ByModel[model] = resp;
          }
        } else if (ev.type === "final") {
          const data = (ev.data as Record<string, unknown>) ?? {};
          const responses = (data.responses as Array<Record<string, unknown>>) ?? [];
          finalResponses = responses.map((r) => ({
            model: (r.model as string) ?? "",
            content: (r.content as string | null) ?? null,
            error: (r.error as string | null) ?? null,
          }));
        }
      } catch {
        // ignore parse errors on stream lines
      }
    }

    const modelResults: ModelBenchmarkResult[] = [];
    for (const model of models) {
      const r1 = round1ByModel[model];
      const fin = finalResponses.find((r) => r.model === model) ?? null;

      const [r1Option, r1Err] = parseChoiceOutput(r1?.content ?? null);
      const [finOption, finErr] = parseChoiceOutput(fin?.content ?? null);

      const r1Correct = r1Option != null && r1Option === expected;
      const finCorrect = finOption != null && finOption === expected;
      const r1Status = benchmarkAnswerStatus(r1Option, r1Err, expected);
      const finStatus = benchmarkAnswerStatus(finOption, finErr, expected);

      if (r1Correct) totalRound1Correct++;
      if (finCorrect) totalFinalCorrect++;

      modelResults.push({
        model,
        round1_raw_response: r1?.content ?? null,
        final_raw_response: fin?.content ?? null,
        round1_option: r1Option,
        final_option: finOption,
        round1_correct: r1Correct,
        final_correct: finCorrect,
        round1_status: r1Status,
        final_status: finStatus,
        round1_parse_error: r1Err,
        final_parse_error: finErr,
      });
    }

    const caseResult: BenchmarkCaseResult = {
      case_index: caseIdx,
      question: case_.question,
      expected_option: case_.expected_option,
      model_results: modelResults,
    };
    yield `${JSON.stringify({
      type: "benchmark_case_result",
      data: caseResult,
    })}\n`;
  }

  const round1Acc = totalAnswers > 0 ? totalRound1Correct / totalAnswers : 0;
  const finalAcc = totalAnswers > 0 ? totalFinalCorrect / totalAnswers : 0;
  const summary: BenchmarkSummary = {
    total_cases: cases.length,
    round1_correct: totalRound1Correct,
    final_correct: totalFinalCorrect,
    round1_accuracy: round1Acc,
    final_accuracy: finalAcc,
    delta: finalAcc - round1Acc,
  };
  yield `${JSON.stringify({
    type: "benchmark_summary",
    data: summary,
  })}\n`;
}
