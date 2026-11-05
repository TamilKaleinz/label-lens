/**
 * Deterministic stand-in models, so the whole pipeline runs in tests and CI without an API key.
 * They test the plumbing and the gates, not answer quality: that needs the real model (M4 evals).
 */
import { canonical } from "./verify.js";
import type { ModelClient, ModelRequest } from "./model.js";

interface Excerpt { code: string; text: string }

/** Reads the excerpts back out of the generator prompt built by buildGeneratePrompt. */
export function excerptsFromPrompt(user: string): Excerpt[] {
  const re = /\[E\d+\] section (\S+)[^\n]*\n([\s\S]*?)(?=\n\n\[E\d+\] |$)/g;
  return [...user.matchAll(re)].map((m) => ({ code: m[1] as string, text: (m[2] as string).trim() }));
}

function firstSentence(text: string): string {
  // Skip the heading words, then take the first full sentence of at least 6 words.
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
  return sentences.find((s) => s.split(/\s+/).length >= 6 && !/^\d/.test(s)) ?? sentences[0] ?? text;
}

/**
 * Extractive mock: for "generate", quotes the first sentence of the top two excerpts and uses the
 * quote as the claim. For "support", says supported only if every content word of the claim is in
 * the quote: a crude but deterministic rule that also rejects UC-04 ("to prevent lactic acidosis").
 */
export class ExtractiveModel implements ModelClient {
  readonly calls: ModelRequest[] = [];
  async complete(req: ModelRequest): Promise<string> {
    this.calls.push(req);
    if (req.purpose === "support") {
      const claim = /^Claim: (.*)$/m.exec(req.user)?.[1] ?? "";
      const quote = canonical(/^Quote: (.*)$/m.exec(req.user)?.[1] ?? "").text;
      const words = claim.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const supported = words.every((w) => quote.includes(w));
      return JSON.stringify({ supported, reason: supported ? "all claim words in quote" : "claim adds words not in quote" });
    }
    const ex = excerptsFromPrompt(req.user).slice(0, 2);
    const claims = ex.map((e) => {
      const q = firstSentence(e.text);
      return { text: q, section_code: e.code, quote: q };
    });
    return JSON.stringify({ label_silent: claims.length === 0, claims });
  }
}

/** Replies from a script: a function of the request, for adversarial and failure tests. */
export class ScriptedModel implements ModelClient {
  readonly calls: ModelRequest[] = [];
  constructor(private readonly reply: (req: ModelRequest, n: number) => string | Promise<string>) {}
  async complete(req: ModelRequest): Promise<string> {
    this.calls.push(req);
    return this.reply(req, this.calls.length);
  }
}
