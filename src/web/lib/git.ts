// SPDX-License-Identifier: MIT
// Git pipeline per feature: the furthest state its branches reach, and its pull requests' worst state.
import type { Card, CardGit } from "../../types.js";

type Pr = NonNullable<CardGit["pr"]>;
export type GitStep = "wip" | "staged" | "committed" | "pr";

export const GIT_STEPS: { k: GitStep; name: string; icon: string }[] = [
	{ k: "wip", name: "WIP", icon: "PencilSimpleLine" },
	{ k: "staged", name: "Staged", icon: "Tray" },
	{ k: "committed", name: "Committed", icon: "GitCommit" },
	{ k: "pr", name: "PR", icon: "GitPullRequest" },
];
const GIT_RANK = { landed: 0, wip: 1, staged: 2, committed: 3, pr: 4 };

/* ---- pull request status: the chip shows the worst state, the details show each one ---- */
export type PrState = { k: string; text: string; chip?: string; attn?: boolean; test: (p: Pick<Pr, "draft" | "checks" | "review" | "conflicts">) => boolean };
export const PR_STATES: PrState[] = [
	{ k: "conflicts", text: "Conflicts", chip: "Conflicts", attn: true, test: (p) => p.conflicts },
	{ k: "failing", text: "Checks failing", chip: "Failing", attn: true, test: (p) => p.checks === "fail" },
	{ k: "changes", text: "Changes requested", chip: "Changes", test: (p) => p.review === "changes" },
	{ k: "pending", text: "Checks pending", chip: "Pending", test: (p) => p.checks === "pending" },
	{ k: "review", text: "Review required", chip: "Review", test: (p) => p.review === "required" && !p.draft },
	{ k: "passing", text: "Checks passing", chip: "Passing", test: (p) => p.checks === "pass" },
];
const PR_DETAIL: PrState[] = [
	...PR_STATES,
	{ k: "approved", text: "Approved", test: (p) => p.review === "approved" },
	{ k: "draft", text: "Draft", test: (p) => p.draft },
];
export const prStates = (p: Parameters<PrState["test"]>[0]) => PR_DETAIL.filter((s) => s.test(p));
export const prWorst = (prs: Parameters<PrState["test"]>[0][]) => PR_STATES.find((s) => prs.some(s.test)) ?? null;

export type GitSummary = Record<GitStep, number> & { prs: Pr[]; worst: PrState | null; flight: number; top: GitStep | "landed" | null; rank: number };

export function gitSummary(c: Pick<Card, "git" | "landed">): GitSummary {
	const t = { wip: 0, staged: 0, committed: 0, pr: 0, prs: [] as Pr[] };
	for (const g of c.git) {
		t.wip += g.wip;
		t.staged += g.staged;
		t.committed += g.committed;
		if (g.pr) {
			t.pr += 1;
			t.prs.push(g.pr);
		}
	}
	const top = t.pr ? "pr" : t.committed ? "committed" : t.staged ? "staged" : t.wip ? "wip" : c.landed ? "landed" : null;
	return { ...t, worst: prWorst(t.prs), flight: t.wip + t.staged + t.committed, top, rank: top ? GIT_RANK[top] : -1 };
}
