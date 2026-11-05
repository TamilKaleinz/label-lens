/**
 * Label resolver (architecture doc 4.4.2; PRD F-01, D-15, D-16). Deterministic: the model never picks a label.
 *
 * 1. Exact product (NDC or set ID) wins, manufacturer or repackager. No match: not_found, never a substitute.
 * 2. Name only: match labels, group them. More than one group: ask, in every role.
 * 3. One group: Pharmacist may get the representative label; Medical Information and PV must pick the exact label.
 * 4. A resolved label in a format v1 doesn't answer from (older Rx, OTC) is identified, then declined.
 */
import { buildGroups, describeGroup } from "./groups.js";
import { labelMatchesName, parseQuery } from "./match.js";
import type { EquivalenceGroup, LabelMeta, LabelRef, ResolveResult, Role } from "./types.js";

export class LabelStore {
  readonly labels: LabelMeta[];
  readonly groups: EquivalenceGroup[];
  constructor(labels: LabelMeta[]) {
    this.labels = labels;
    this.groups = buildGroups(labels);
  }
  byNdc(ndc: string): LabelMeta | undefined {
    const n = ndc.trim();
    return this.labels.find((l) => l.productNdcs.includes(n) || l.packageNdcs.includes(n));
  }
  bySetId(setId: string, version?: string): LabelMeta | undefined {
    return this.labels.find((l) => l.setId === setId && (version === undefined || l.version === version));
  }
  groupOf(label: LabelMeta): EquivalenceGroup {
    return this.groups.find((g) => g.members.includes(label)) as EquivalenceGroup;
  }
}

function finish(label: LabelMeta, representative: boolean, via: "exact" | "group"): ResolveResult {
  if (label.format !== "PLR") {
    const kind = label.format === "OTC" ? "an OTC Drug Facts label" : "an older label format";
    return {
      status: "unsupported_format",
      label,
      message: `This is ${kind}, which Label Lens doesn't support yet. Here is the official label link.`,
    };
  }
  return { status: "resolved", label, representative, via };
}

function withinGroup(g: EquivalenceGroup, role: Role): ResolveResult {
  if (g.members.length === 1) return finish(g.members[0] as LabelMeta, false, "group");
  if (role !== "pharmacist") return { status: "needs_choice", kind: "label", groupId: g.id, labels: g.members };
  return finish(g.representative, true, "group");
}

export function resolve(store: LabelStore, ref: LabelRef, role: Role): ResolveResult {
  if ("ndc" in ref) {
    const l = store.byNdc(ref.ndc);
    return l ? finish(l, false, "exact") : { status: "not_found", message: `No label found for NDC ${ref.ndc}. Search by name instead?` };
  }
  if ("setId" in ref) {
    const l = store.bySetId(ref.setId, ref.version);
    return l ? finish(l, false, "exact") : { status: "not_found", message: "No label found for that label ID." };
  }
  if ("groupId" in ref) {
    const g = store.groups.find((x) => x.id === ref.groupId);
    return g ? withinGroup(g, role) : { status: "not_found", message: "That product group no longer exists." };
  }

  const pq = parseQuery(ref.q);
  const matched = store.labels.filter((l) => labelMatchesName(l, pq.nameTokens));
  if (matched.length === 0) {
    return { status: "not_found", message: "This name isn't in the US FDA label data. Try the generic name." };
  }
  if (matched.length === 1) return finish(matched[0] as LabelMeta, false, "group");

  let groups = store.groups.filter((g) => g.members.some((m) => matched.includes(m)));
  // Hints narrow, never widen. Uncertain groups are kept, because their form is unknown (fail closed).
  const narrowed = groups.filter(
    (g) => g.uncertain || ((!pq.dosageForm || g.dosageForm === pq.dosageForm) && (!pq.release || g.release === pq.release)),
  );
  if (narrowed.length > 0) groups = narrowed;

  if (groups.length === 1) return withinGroup(groups[0] as EquivalenceGroup, role);
  return {
    status: "needs_choice",
    kind: "group",
    groups: groups.map((g) => ({ groupId: g.id, description: describeGroup(g), labelCount: g.members.length })),
  };
}
