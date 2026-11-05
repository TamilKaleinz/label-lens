import { cpSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configDir, hashDir, loadConfig } from "../src/config.js";

describe("config bundle", () => {
  it("loads models, prompts, role styles and retrieval settings", () => {
    const c = loadConfig();
    expect(c.models.provider).toBe("openai");
    expect(Object.keys(c.prompts.roles).sort()).toEqual(["medical_information", "pharmacist", "pv"]);
    expect(c.prompts.generate).toContain("{{role_style}}");
    expect(c.hash).toMatch(/^[0-9a-f]{12}$/);
  });
  it("changes the hash when any prompt changes, so the eval gate re-runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "ll-config-"));
    cpSync(configDir, dir, { recursive: true });
    const before = hashDir(dir);
    expect(before).toBe(hashDir(configDir));
    const p = join(dir, "prompts/support.md");
    writeFileSync(p, readFileSync(p, "utf8") + " ");
    expect(hashDir(dir)).not.toBe(before);
  });
});
