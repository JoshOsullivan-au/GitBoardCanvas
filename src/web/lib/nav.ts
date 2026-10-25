// SPDX-License-Identifier: MIT
// What the sidebar counts, from the Roadmap's read model: features per stage, work in flight per branch, and the
// features that need a person. Items with nothing in them are left out, so a healthy board is quiet. Each "Needs you"
// count matches what its Roadmap filter shows.
import type { CardGit } from "../../types.js";
import { emptyFilters, type Feature, type Filters, isBlocked, type Model } from "../roadmap/model";
import { prWorst, type PrState } from "./git";
import type { Need } from "./hash";

/** `lead` is the feature with the most files on the branch: the one its row opens. */
export type NavBranch = { branch: string; files: number; features: number; lead: string; pr: { number: number; worst: PrState | null } | null };
export type NavNeed = { need: Need; label: string; icon: string; count: number };
/** `attention` counts each feature once, however many "Needs you" items it is under. */
export type Nav = { stages: { id: number; name: string; count: number }[]; features: number; branches: NavBranch[]; needs: NavNeed[]; attention: number };

type Pr = NonNullable<CardGit["pr"]>;

const NEED_ITEMS: { need: Need; label: string; icon: string; github?: boolean; test: (c: Feature) => boolean }[] = [
	{ need: "blocked", label: "Blocked", icon: "Lock", test: isBlocked },
	{ need: "gated", label: "Gated", icon: "HourglassMedium", test: (c) => c.gated },
	{ need: "failing", label: "Checks failing", icon: "Warning", github: true, test: (c) => c.git.some((g) => g.pr?.checks === "fail") },
	{ need: "review", label: "Needs review", icon: "UserCircle", github: true, test: (c) => c.git.some((g) => g.pr?.review === "required" && !g.pr.draft) },
];

/** The filter a "Needs you" item turns on: [filter group, option value] in the Roadmap's filter panel. */
export const NEED_FILTER: Record<Need, ["state" | "git", string]> = { blocked: ["state", "blocked"], gated: ["state", "gated"], failing: ["git", "failing"], review: ["git", "review"] };

/**
 * The Roadmap's filters when the place changes. A "Needs you" place shows only its own filter and keeps the person's
 * filters aside (`own`); leaving it for any other place puts them back. Moving from one such place to another keeps
 * the filters set aside the first time.
 */
export function placeFilters(need: Need | null, shown: Filters, own: Filters | null): { shown: Filters; own: Filters | null } {
	if (need) {
		const [g, v] = NEED_FILTER[need];
		const one = emptyFilters();
		one[g].add(v);
		return { shown: one, own: own ?? shown };
	}
	return own ? { shown: own, own: null } : { shown, own: null };
}

/** True when a feature has work on `branch`. */
export const onBranch = (c: Pick<Feature, "git">, branch: string) => c.git.some((g) => g.branch === branch);

export function navOf(m: Model): Nav {
	const stages = m.stages.map((s) => ({ id: s.id, name: s.name, count: m.cards.filter((c) => c.stage === s.id).length }));
	const byBranch = new Map<string, { files: number; features: Set<string>; lead: { id: string; files: number }; prs: Pr[] }>();
	for (const c of m.cards) {
		for (const g of c.git) {
			const b = byBranch.get(g.branch) ?? { files: 0, features: new Set<string>(), lead: { id: c.id, files: -1 }, prs: [] };
			const files = g.wip + g.staged + g.committed;
			b.files += files;
			if (files > b.lead.files) b.lead = { id: c.id, files };
			b.features.add(c.id);
			if (g.pr && !b.prs.some((p) => p.number === g.pr!.number)) b.prs.push(g.pr);
			byBranch.set(g.branch, b);
		}
	}
	const branches = [...byBranch]
		.map(([branch, b]) => ({ branch, files: b.files, features: b.features.size, lead: b.lead.id, pr: b.prs.length ? { number: b.prs[0].number, worst: prWorst(b.prs) } : null }))
		.sort((a, b) => b.files - a.files || a.branch.localeCompare(b.branch));
	const items = NEED_ITEMS.filter((n) => !n.github || m.github === true);
	const needs = items.map(({ need, label, icon, test }) => ({ need, label, icon, count: m.cards.filter(test).length })).filter((n) => n.count > 0);
	const attention = m.cards.filter((c) => items.some((n) => n.test(c))).length;
	return { stages, features: m.cards.length, branches, needs, attention };
}
