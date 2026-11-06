/**
 * Model access (architecture doc AD-04). The engine talks to one small interface, so tests and evals
 * run on deterministic mock models and the OpenAI API is swapped in without touching the pipeline.
 */
import { loadEnv } from "./env.js";

export interface ModelRequest {
  purpose: "generate" | "support" | "safety";
  model: string | null;
  /** null = leave it to the model's default. */
  temperature: number | null;
  system: string;
  user: string;
  /** JSON Schema the reply must match (OpenAI structured outputs, strict mode). */
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface ModelClient {
  /** Returns the model's raw JSON text. Throws on transport or API errors. */
  complete(req: ModelRequest): Promise<string>;
}

export class ModelError extends Error {}

/**
 * OpenAI Chat Completions with strict structured output. Reads OPENAI_API_KEY from the environment,
 * or from the repo's .env file locally. Needs a model ID set in config/models.json; with the key or
 * the model missing it refuses to call, rather than falling back silently.
 */
export interface Usage { calls: number; inputTokens: number; outputTokens: number; ms: number }

export class OpenAIClient implements ModelClient {
  /** Running totals per purpose, for eval reports and cost estimates. */
  readonly usage: Record<ModelRequest["purpose"], Usage> = {
    generate: { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 },
    support: { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 },
    safety: { calls: 0, inputTokens: 0, outputTokens: 0, ms: 0 },
  };

  constructor(
    private readonly apiKey = (loadEnv(), process.env["OPENAI_API_KEY"]),
    private readonly baseUrl = "https://api.openai.com/v1",
    private readonly timeoutMs = 30_000,
  ) {}

  async complete(req: ModelRequest): Promise<string> {
    if (!this.apiKey) throw new ModelError("OPENAI_API_KEY is not set");
    if (!req.model) throw new ModelError(`No ${req.purpose} model set in config/models.json`);
    const t0 = Date.now();
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: req.model,
        ...(req.temperature === null ? {} : { temperature: req.temperature }),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        response_format: { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
      }),
    });
    if (!res.ok) throw new ModelError(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: string; refusal?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const u = this.usage[req.purpose];
    u.calls++;
    u.inputTokens += body.usage?.prompt_tokens ?? 0;
    u.outputTokens += body.usage?.completion_tokens ?? 0;
    u.ms += Date.now() - t0;
    const msg = body.choices?.[0]?.message;
    if (msg?.refusal) throw new ModelError(`Model refused: ${msg.refusal}`);
    if (typeof msg?.content !== "string") throw new ModelError("OpenAI reply had no content");
    return msg.content;
  }
}
