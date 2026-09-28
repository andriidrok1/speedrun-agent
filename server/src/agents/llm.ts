// OpenAI client + one call: proposeTurn(). The model must answer with the propose_offer function call.
// Retries (feeding the referee's error back) live in negotiate.ts; this file only does the round trip.
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { FunctionDefinition } from 'openai/resources/shared';
import type { Side } from '../types';

export const DEFAULT_MODEL = 'gpt-5-mini';
export const MAX_OUTPUT_TOKENS = 4000; // gpt-5 family counts reasoning tokens here

export type LlmClient = { openai: OpenAI; model: string };

export function createClient(apiKey: string, model = process.env.OPENAI_MODEL || DEFAULT_MODEL): LlmClient {
  if (!apiKey) throw new Error('createClient: empty OPENAI_API_KEY');
  return { openai: new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 }), model };
}

export type ProposeTurnResult = {
  /** Parsed JSON arguments of the propose_offer call (shape unchecked, negotiate.ts validates). */
  input: unknown;
  /** Text the model wrote next to the tool call, if any. */
  text: string | undefined;
  /** The assistant message to append so a retry can reference the call by id. */
  assistant: ChatCompletionMessageParam;
  toolCallId: string;
  ms: number;
};

/** Thrown when the API rejects the model id. The CLI prints it verbatim and exits 2. */
export class ModelNotFoundError extends Error {
  constructor(model: string, cause: unknown) {
    super(`model "${model}" not found: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ModelNotFoundError';
  }
}

function isModelNotFound(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false;
  const code = (err.error as { code?: string } | undefined)?.code ?? err.code;
  return err.status === 404 || code === 'model_not_found';
}

export async function proposeTurn(input: {
  client: LlmClient;
  side: Side;
  round: number;
  system: string;
  messages: ChatCompletionMessageParam[];
  tool: FunctionDefinition;
}): Promise<ProposeTurnResult> {
  const { client, side, round, system, messages, tool } = input;
  const t0 = Date.now();
  let completion;
  try {
    completion = await client.openai.chat.completions.create({
      model: client.model,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      ...(/^(gpt-5|o\d)/.test(client.model) ? { reasoning_effort: 'low' as const } : {}),
      messages: [{ role: 'system', content: system }, ...messages],
      tools: [{ type: 'function', function: tool }],
      tool_choice: { type: 'function', function: { name: tool.name } },
      parallel_tool_calls: false,
    });
  } catch (err) {
    if (isModelNotFound(err)) throw new ModelNotFoundError(client.model, err);
    throw new Error(`proposeTurn: round ${round} ${side}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  const ms = Date.now() - t0;
  const choice = completion.choices[0];
  if (!choice) throw new Error(`proposeTurn: round ${round} ${side}: empty choices`);
  if (choice.finish_reason === 'length') {
    throw new Error(`proposeTurn: round ${round} ${side}: output truncated at ${MAX_OUTPUT_TOKENS} tokens`);
  }
  const call = choice.message.tool_calls?.find((c) => c.type === 'function' && c.function.name === tool.name);
  if (!call || call.type !== 'function') {
    throw new Error(`proposeTurn: round ${round} ${side}: model did not call ${tool.name} (finish_reason ${choice.finish_reason})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch (err) {
    throw new Error(`proposeTurn: round ${round} ${side}: tool arguments are not JSON: ${call.function.arguments.slice(0, 200)}`, { cause: err });
  }
  const text = typeof choice.message.content === 'string' && choice.message.content.trim() ? choice.message.content.trim() : undefined;
  return { input: parsed, text, assistant: choice.message as ChatCompletionMessageParam, toolCallId: call.id, ms };
}
