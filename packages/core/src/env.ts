/**
 * Loads environment variables from the repo's .env file, if there is one. Values already set in
 * the environment (CI secrets, the hosting platform) win, so .env is only a local convenience.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const envFile = join(import.meta.dirname, "../../../.env");
let loaded = false;

export function loadEnv(path = envFile): void {
  if (loaded) return;
  loaded = true;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    const [, key, raw] = m as unknown as [string, string, string];
    const value = raw.replace(/^(["'])(.*)\1$/, "$2");
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}
