// SPDX-License-Identifier: MIT
// The Roadmap tab's read model: relations, card state, filters and orders over /api/board.
import type { Board, Card, Stage } from "../../types.js";
import { hasIcon } from "../lib/icon";
import { plural } from "../lib/format";
import { gitSummary } from "../lib/git";

/** A card with its relations. blocked waits on a feature that is not in the last stage; gated waits on a person; linked is any other mention. */
export type Feature = Card & {
	idx: number;
	dependents: string[];
	backlinks: string[];
	blockedBy: string[];
	gated: boolean;
	linkIds: string[];
	chained: boolean;
	/** Set while a drag or a keyboard grab holds the card in another stage: it sorts first in its cell. */
	top?: boolean;
};

export type Model = {
	cards: Feature[];
	byId: Map<string, Feature>;
	stages: Stage[];
	groups: string[];
	groupIcons: Record<string, string>;
	roadmapDir: string;
	mainBranch: string;
	github: boolean | null;
	version: string | null;
};

const GROUP_ICON = "Stack";

export function buildModel(data: Board): Model {
	const last = data.stages[data.stages.length - 1]?.id;
	const ids = new Set(data.cards.map((c) => c.id));
	const cards: Feature[] = data.cards.map((c, idx) => ({
		...c,
		idx,
		deps: c.deps.filter((id) => ids.has(id)),
		links: c.links.filter((id) => ids.has(id)),
		dependents: [],
		backlinks: [],
		blockedBy: [],
		gated: false,
		linkIds: [],
		chained: false,
	}));
	const byId = new Map(cards.map((c) => [c.id, c]));
	for (const c of cards) {
		for (const d of c.deps) byId.get(d)!.dependents.push(c.id);
		for (const l of c.links) byId.get(l)!.backlinks.push(c.id);
	}
	for (const c of cards) {
		const open = c.stage !== last;
		c.blockedBy = open ? c.deps.filter((id) => byId.get(id)!.stage !== last) : [];
		c.gated = open && (c.decisions.length > 0 || c.ops.length > 0);
		c.linkIds = [...new Set([...c.links, ...c.backlinks, ...c.deps, ...c.dependents])];
		c.chained = c.deps.length > 0 || c.dependents.length > 0;
	}
	return {
		cards,
		byId,
		stages: data.stages,
		groups: [...new Set([...data.groups, ...cards.map((c) => c.group)])],
		groupIcons: data.groupIcons || {},
		roadmapDir: data.roadmapDir,
		mainBranch: data.mainBranch,
		github: data.github,
		version: data.version,
	};
}

export const lastStage = (m: Model) => m.stages[m.stages.length - 1]?.id;
export const isDone = (m: Model, c: Pick<Card, "stage">) => c.stage === lastStage(m);
export const isBlocked = (c: Feature) => c.blockedBy.length > 0;
export const stageName = (m: Model, id: number) => m.stages.find((s) => s.id === id)?.name ?? String(id);
export const groupIcon = (m: Model, g: string) => (hasIcon(m.groupIcons[g]) ? m.groupIcons[g] : GROUP_ICON);

/* A stage's colour by its place on the board, since stages are configurable: the first reads idle, the last done, and
   the ones between run purple, blue, amber towards it. Fewer than three between take the ones nearest done. */
const STAGE_MID = ["var(--st-pr)", "var(--st-commit)", "var(--tone-att)"];
export function stageTone(m: Model, id: number): string {
	const i = m.stages.findIndex((s) => s.id === id);
	const last = m.stages.length - 1;
	if (i <= 0) return "var(--muted-foreground)";
	if (i === last) return "var(--tone-good)";
	const k = last - 1;
	const j = i - 1;
	return STAGE_MID[k <= STAGE_MID.length ? STAGE_MID.length - k + j : Math.floor((j * STAGE_MID.length) / k)];
}

export type CardState = { cls: "done" | "lock" | "wait" | ""; word: string; mark: string | null };

export function cardState(m: Model, c: Feature): CardState {
	if (isDone(m, c)) return { cls: "done", word: c.total ? `${stageName(m, c.stage)} · ${c.done}/${c.total}` : stageName(m, c.stage), mark: "Check" };
	if (isBlocked(c)) return { cls: "lock", word: `Blocked by ${c.blockedBy.length}`, mark: "Lock" };
	if (c.gated) {
		return { cls: "wait", word: c.decisions.length ? `${plural(c.decisions.length, "decision")} open` : `${plural(c.ops.length, "ops step")} open`, mark: null };
	}
	return { cls: "", word: c.total ? `${c.done}/${c.total} ticked` : c.phases ? plural(c.phases, "phase") : stageName(m, c.stage), mark: null };
}

/* ---- filters: options in one group widen (or), groups narrow (and); filtered cards are hidden ---- */
export const FILTER_GROUPS = ["git", "state", "group", "stage", "progress"] as const;
export type FilterGroup = (typeof FILTER_GROUPS)[number];
export type Filters = Record<FilterGroup, Set<string>>;
export const GROUP_NAME: Record<FilterGroup, string> = { git: "Git", state: "State", group: "Group", stage: "Stage", progress: "Progress" };
export const emptyFilters = (): Filters => Object.fromEntries(FILTER_GROUPS.map((g) => [g, new Set<string>()])) as Filters;

/** [value, label, icon, test] */
export type FilterOption = [string, string, string | null, (c: Feature) => boolean];

const progressOf = (c: Feature) => (!c.total ? "none" : c.done === 0 ? "not" : c.done === c.total ? "all" : "under");

export function filterOptions(m: Model): Record<FilterGroup, FilterOption[]> {
	return {
		git: [
			["wip", "WIP", "PencilSimpleLine", (c) => gitSummary(c).wip > 0],
			["staged", "Staged", "Tray", (c) => gitSummary(c).staged > 0],
			["committed", "Committed", "GitCommit", (c) => gitSummary(c).committed > 0],
			["pr", "PR", "GitPullRequest", (c) => gitSummary(c).pr > 0],
			["failing", "Checks failing", "Warning", (c) => gitSummary(c).prs.some((p) => p.checks === "fail")],
			["review", "Needs review", "UserCircle", (c) => gitSummary(c).prs.some((p) => p.review === "required" && !p.draft)],
			["flight", "In flight", "GitBranch", (c) => c.git.length > 0],
			["still", "Nothing in flight", "GitMerge", (c) => c.git.length === 0],
		],
		state: [
			["blocked", "Blocked", "Lock", (c) => isBlocked(c)],
			["gated", "Gated", "HourglassMedium", (c) => c.gated],
			["linked", "Linked", "Link", (c) => c.chained],
		],
		group: m.groups.map((s) => [s, s, groupIcon(m, s), (c) => c.group === s]),
		stage: m.stages.map((s) => [String(s.id), `${s.id} ${s.name}`, null, (c) => c.stage === s.id]),
		progress: [
			["not", "Not started", null, (c) => progressOf(c) === "not"],
			["under", "Under way", null, (c) => progressOf(c) === "under"],
			["all", "All ticked", null, (c) => progressOf(c) === "all"],
			["none", "No checklist", null, (c) => progressOf(c) === "none"],
		],
	};
}

export const activeFilters = (f: Filters) => FILTER_GROUPS.reduce((n, g) => n + f[g].size, 0);

export function searchHit(q: string, c: Feature): boolean {
	if (!q) return true;
	const s = q.toLowerCase();
	return c.title.toLowerCase().includes(s) || c.slug.includes(s);
}

const pct = (c: Feature) => (c.total ? c.done / c.total : -1);
type Order = (a: Feature, b: Feature) => number;
export const ORDERS: Record<string, Order> = {
	touched: (a, b) => (b.touchedAt ?? 0) - (a.touchedAt ?? 0),
	git: (a, b) => gitSummary(b).rank - gitSummary(a).rank || gitSummary(b).flight - gitSummary(a).flight,
	flight: (a, b) => gitSummary(b).flight - gitSummary(a).flight || gitSummary(b).rank - gitSummary(a).rank,
	blocked: (a, b) => b.blockedBy.length - a.blockedBy.length,
	gated: (a, b) => b.decisions.length + b.ops.length - (a.decisions.length + a.ops.length),
	done: (a, b) => pct(b) - pct(a),
	todo: (a, b) => (pct(a) < 0 ? 2 : pct(a)) - (pct(b) < 0 ? 2 : pct(b)),
	linked: (a, b) => b.linkIds.length - a.linkIds.length,
	landed: (a, b) => (b.landed?.at ?? 0) - (a.landed?.at ?? 0),
	created: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
	stage: (a, b) => a.idx - b.idx,
	title: (a, b) => a.title.localeCompare(b.title),
};

export const ORDER_LABELS: [string, string][] = [
	["touched", "Last change"],
	["git", "Furthest in git"],
	["flight", "Most files in flight"],
	["blocked", "Blocked first"],
	["gated", "Most waiting on you"],
	["done", "Most complete"],
	["todo", "Least complete"],
	["linked", "Most linked"],
	["landed", "Last landed"],
	["created", "Newest created"],
	["stage", "Roadmap order"],
	["title", "Title A to Z"],
];

/** A card held in another stage by a drag or a keyboard grab: shown there, sorted first, until the move lands or reverts. */
export type Held = { id: string; stage: number } | null;

/** The cards as shown: a held card sits in the stage it is held over. */
export function placed(m: Model, held: Held): Feature[] {
	if (!held) return m.cards;
	return m.cards.map((c) => (c.id === held.id ? { ...c, stage: held.stage, top: true } : c));
}

/** What decides whether a card shows: the search, the filters and their options, the order, a pinned card (the
 * one being dragged or grabbed, which always shows), and a branch from the sidebar (only features with work on it). */
export type View = { q: string; filters: Filters; opts: Record<FilterGroup, FilterOption[]>; order: string; pinned: string | null; branch: string | null };

const inGroup = (v: View, g: FilterGroup, c: Feature) => !v.filters[g].size || v.opts[g].some(([val, , , test]) => v.filters[g].has(val) && test(c));

export function visible(v: View, c: Feature): boolean {
	if (v.pinned === c.id) return true;
	return searchHit(v.q, c) && (!v.branch || c.git.some((g) => g.branch === v.branch)) && FILTER_GROUPS.every((g) => inGroup(v, g, c));
}

export function cellCards(cards: Feature[], v: View, group: string, stage: number): Feature[] {
	const order = ORDERS[v.order] ?? ORDERS.touched;
	return cards
		.filter((c) => c.group === group && c.stage === stage && visible(v, c))
		.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0) || order(a, b) || (b.touchedAt ?? 0) - (a.touchedAt ?? 0) || a.title.localeCompare(b.title));
}
