/**
 * Support check (architecture doc 4.4.6, step 2): a small model judges whether a claim's quote
 * states everything the claim says. It runs only on claims that passed the deterministic quote
 * check. It fails closed: an error, a refusal or an unparseable reply counts as "not supported".
 */
import type { Config } from "./config.js";
import type { ModelClient } from "./model.js";
import type { Claim, SupportCheck } from "./verify.js";

export const SUPPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supported", "reason"],
  properties: { supported: { type: "boolean" }, reason: { type: "string" } },
} as const;

export function supportCheck(model: ModelClient, config: Config): SupportCheck {
  return async (claim: Claim) => {
    try {
      const raw = await model.complete({
        purpose: "support",
        model: config.models.gate.model,
        temperature: config.models.gate.temperature,
        system: config.prompts.support,
        user: `Claim: ${claim.text}\nQuote: ${claim.quote}`,
        schemaName: "support_verdict",
        schema: SUPPORT_SCHEMA as unknown as Record<string, unknown>,
      });
      const v = JSON.parse(raw) as { supported?: unknown };
      return v.supported === true;
    } catch {
      return false;
    }
  };
}
