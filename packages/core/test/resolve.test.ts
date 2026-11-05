import { describe, expect, it } from "vitest";
import { resolve } from "../src/resolve.js";
import { provisionalFor } from "../src/provisional.js";
import { demoId, groupIdOf, label, store } from "./fixtureStore.js";

const pharm = "pharmacist" as const;

describe("equivalence groups (D-16)", () => {
  it("separates the three metformin products and both combination products", () => {
    const metforminGroups = store.groups.filter((g) => g.substances.includes("METFORMIN HYDROCHLORIDE"));
    expect(metforminGroups).toHaveLength(5);
  });
  it("keeps repackager and original in one group, with the original as representative", () => {
    const g = store.groupOf(label("DS-02"));
    expect(g.members.map(demoId).sort()).toEqual(["DS-01", "DS-02"]);
    expect(demoId(g.representative)).toBe("DS-01");
  });
  it("splits Ozempic tablets from Ozempic injection", () => {
    expect(groupIdOf("DS-17")).not.toBe(groupIdOf("DS-18"));
  });
  it("falls back to the newest label when a group has no original packager", () => {
    expect(demoId(store.groupOf(label("DS-18")).representative)).toBe("DS-18");
  });
});

describe("resolver", () => {
  it("never substitutes for an unknown NDC", () => {
    expect(resolve(store, { ndc: "00000-0000" }, pharm).status).toBe("not_found");
  });
  it("accepts package NDCs as well as product NDCs", () => {
    const r = resolve(store, { ndc: "50090-8043-0" }, pharm);
    expect(r.status === "resolved" && demoId(r.label)).toBe("DS-02");
  });
  it("tolerates a one-letter misspelling", () => {
    const r = resolve(store, { q: "metformn" }, pharm);
    expect(r.status).toBe("needs_choice");
  });
  it("Medical Information never gets a representative label", () => {
    const r = resolve(store, { groupId: groupIdOf("DS-01") }, "medical_information");
    expect(r.status === "needs_choice" && r.kind).toBe("label");
  });
  it("describes groups in plain words", () => {
    const r = resolve(store, { q: "metformin" }, pharm);
    const words = r.status === "needs_choice" && r.kind === "group" ? r.groups.map((g) => g.description) : [];
    expect(words).toContain("Metformin Hydrochloride, extended-release tablets");
    expect(words).toContain("Metformin Hydrochloride, oral solution");
  });
});

describe("provisional rule (D-17)", () => {
  it("flags a case received before a Boxed Warning change", () => {
    const p = provisionalFor(label("DS-01"), "2026-03-01");
    expect(p.provisional).toBe(true);
    expect(p.reasons.join(" ")).toMatch(/Boxed Warning changed in 2026-04/);
  });
  it("treats a change in the receipt month as after receipt", () => {
    expect(provisionalFor(label("DS-03"), "2026-08-15").provisional).toBe(true);
  });
  it("clears when the label and its changes predate receipt", () => {
    expect(provisionalFor(label("DS-01"), "2026-10-01").provisional).toBe(false);
  });
  it("is provisional with no receipt date", () => {
    expect(provisionalFor(label("DS-09")).provisional).toBe(true);
  });
});
