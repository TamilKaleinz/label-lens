/** Confirms OPENAI_API_KEY (from the environment or .env) works, and lists the GPT models it can use. Never prints the key. */
import { loadEnv } from "../packages/core/src/env.js";

loadEnv();
const key = process.env["OPENAI_API_KEY"];
if (!key) { console.error("OPENAI_API_KEY is not set (add it to .env)"); process.exit(1); }
const res = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
if (!res.ok) { console.error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }
const { data } = (await res.json()) as { data: { id: string }[] };
const ids = data.map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id)).sort();
console.log(`Key works. ${ids.length} GPT models available:\n${ids.join("\n")}`);
