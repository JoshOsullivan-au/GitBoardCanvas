// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { GitBoardConfig } from "./config.js";
import { GIT_ENV, git as gitSync, listWorktrees } from "./git.js";
import type { CardGit, PrChecks, PrReview } from "./types.js";

const run = promisify(execFile);

/** Where work on a branch stands: edited, staged, committed but not on main, in an open pull request. */
export type PullRequest = {
	number: number;
	title: string;
	url: string;
	draft: boolean;
	branch: string;
	files: string[];
	checks: PrChecks;
	review: PrReview;
	conflicts: boolean;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const CHECKS = new Map<string, PrChecks>([
	["SUCCESS", "pass"],
	["FAILURE", "fail"],
	["ERROR", "fail"],
	["PENDING", "pending"],
	["EXPECTED", "pending"],
]);

/**
 * GitHub's own rollup of a pull request's checks (`statusCheckRollup.state` on its head commit), the state behind the
 * tick or cross on github.com: it counts only the latest run of each check. No checks is null.
 */
export function checksState(state: string | null | undefined): PrChecks {
	return CHECKS.get(str(state)) ?? null;
}

const REVIEW = new Map<string, PrReview>([
	["APPROVED", "approved"],
	["CHANGES_REQUESTED", "changes"],
	["REVIEW_REQUIRED", "required"],
]);

/** GitHub's review decision. It is only set when branch protection asks for reviews; otherwise it is null. */
export function reviewState(decision: string | null | undefined): PrReview {
	return REVIEW.get(str(decision)) ?? null;
}

/**
 * Checks, review and conflicts for the newest 100 open pull requests, in one GraphQL read. It asks for the rollup's
 * state, not each check: per-check detail for 100 pull requests times out on big repos (HTTP 502 or 504). The
 * `contexts(first: 1)` beside `state` is load-bearing: on a commit with over about 100 checks, GitHub answers `state`
 * alone with SUCCESS even when checks failed, and with the right state once `contexts` is asked for.
 */
export const PR_STATUS_QUERY =
	"query($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { pullRequests(states: OPEN, first: 100, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number reviewDecision mergeable commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 1) { totalCount } } } } } } } } }";

type PrStatus = Pick<PullRequest, "checks" | "review" | "conflicts">;

/** Parses the status query's answer; anything malformed is left out, never thrown on. */
export function parsePrStatus(json: string): Map<number, PrStatus> {
	const out = new Map<number, PrStatus>();
	const nodes = (JSON.parse(json) as { data?: { repository?: { pullRequests?: { nodes?: unknown } } } })?.data?.repository?.pullRequests?.nodes;
	if (!Array.isArray(nodes)) return out;
	for (const n of nodes as {
		number?: unknown;
		reviewDecision?: unknown;
		mergeable?: unknown;
		commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: unknown } | null } }[] };
	}[]) {
		if (typeof n?.number !== "number") continue;
		out.set(n.number, {
			checks: checksState(str(n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state)),
			review: reviewState(str(n.reviewDecision)),
			conflicts: n.mergeable === "CONFLICTING",
		});
	}
	return out;
}

export type BranchGit = {
	branch: string;
	/** Worktree folder, or null for a pull request whose branch has no worktree here. */
	path: string | null;
	wip: string[];
	staged: string[];
	committed: string[];
	commits: number;
	pr: PullRequest | null;
};

/** `prs` is null when GitHub could not be read (the board says Missing GitHub, never "no pull requests"). */
export type Pipeline = { branches: BranchGit[]; prs: PullRequest[] | null; readAt: number };

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await run("git", args, { cwd, env: GIT_ENV, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	return stdout;
}

/** `git status --porcelain -z`: index column set means staged; worktree column set, or untracked, means WIP. */
export function parseStatus(z: string): { wip: string[]; staged: string[] } {
	const wip: string[] = [];
	const staged: string[] = [];
	const parts = z.split("\0");
	for (let i = 0; i < parts.length; i++) {
		const entry = parts[i];
		if (entry.length < 4) continue;
		const x = entry[0];
		const y = entry[1];
		const file = entry.slice(3);
		if (x === "R" || x === "C") i += 1; // the next field is the old path
		if (x === "?" && y === "?") wip.push(file);
		else {
			if (x !== " " && x !== "!") staged.push(file);
			if (y !== " " && y !== "!") wip.push(file);
		}
	}
	return { wip, staged };
}

type PrRow = Omit<PullRequest, keyof PrStatus>;

const prCache = new Map<string, { at: number; rows: PrRow[] | null }>();
const statusCache = new Map<string, { at: number; statuses: Map<number, PrStatus>; inflight: Promise<void> | null }>();

const NO_STATUS: PrStatus = { checks: null, review: null, conflicts: false };
const GH = { encoding: "utf8" as const, maxBuffer: 16 * 1024 * 1024 };

/**
 * Starts the status read for a repo when the last one is over a minute old, and never waits on it: the board's first
 * refresh opens the port and a move's refresh returns on the list alone. The status lands in `statusCache` for the
 * next read. A failed or unreadable status leaves none, so cards show their pull requests without it. It gets 30 s
 * because it runs beside the list and slows with it on big repos (7 to 11 s alone, past 20 s together).
 */
function refreshStatus(root: string, now: number): Promise<void> {
	let entry = statusCache.get(root);
	if (!entry) {
		entry = { at: 0, statuses: new Map(), inflight: null };
		statusCache.set(root, entry);
	}
	if (entry.inflight) return entry.inflight;
	if (entry.at && now - entry.at < 60_000) return Promise.resolve();
	const e = entry;
	e.inflight = run("gh", ["api", "graphql", "-F", "owner={owner}", "-F", "repo={repo}", "-f", `query=${PR_STATUS_QUERY}`], {
		...GH,
		cwd: root,
		timeout: 30_000,
	})
		.then(({ stdout }) => {
			e.statuses = parsePrStatus(stdout);
		})
		.catch(() => {
			e.statuses = new Map();
		})
		.finally(() => {
			e.at = Date.now();
			e.inflight = null;
		});
	return e.inflight;
}

/** Resolves once a repo's status read in flight, if any, has landed. For tests and callers that want status now. */
export function statusSettled(root: string): Promise<void> {
	return statusCache.get(root)?.inflight ?? Promise.resolve();
}

/**
 * Open pull requests through the GitHub CLI, read only, the list cached for a minute per repo. Each read merges the
 * latest status the background read has (see `refreshStatus`); a pull request without one shows no checks, review or
 * conflicts.
 */
async function openPullRequests(root: string, now = Date.now()): Promise<PullRequest[] | null> {
	void refreshStatus(root, now);
	let hit = prCache.get(root);
	if (!hit || now - hit.at >= 60_000) {
		let rows: PrRow[] | null;
		try {
			const { stdout } = await run(
				"gh",
				["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,url,isDraft,headRefName,files"],
				{ ...GH, cwd: root, timeout: 20_000 },
			);
			const parsed = JSON.parse(stdout) as {
				number: number;
				title: string;
				url: string;
				isDraft: boolean;
				headRefName: string;
				files?: { path: string }[];
			}[];
			rows = parsed.map((r) => ({
				number: r.number,
				title: r.title,
				url: r.url,
				draft: r.isDraft,
				branch: r.headRefName,
				files: (r.files ?? []).map((f) => f.path),
			}));
		} catch {
			rows = null;
		}
		hit = { at: now, rows };
		prCache.set(root, hit);
	}
	const statuses = statusCache.get(root)?.statuses ?? new Map<number, PrStatus>();
	return hit.rows?.map((r) => ({ ...r, ...(statuses.get(r.number) ?? NO_STATUS) })) ?? null;
}

/**
 * Every worktree's edits, staged files and unlanded commits, read in parallel, plus open pull requests (only when
 * `config.github` is on and `opts.prs` is not false). GitBoard's own `gitboard-move/` branches are skipped.
 */
export async function readPipeline(root: string, config: GitBoardConfig, opts: { prs?: boolean } = {}): Promise<Pipeline> {
	const main = config.mainBranch;
	const trees = listWorktrees(root).filter((w) => !w.branch?.startsWith("gitboard-move/"));
	const prs = config.github && opts.prs !== false ? await openPullRequests(root) : null;
	const branches = await Promise.all(
		trees.map(async (w): Promise<BranchGit | null> => {
			const branch = w.branch ?? path.basename(w.path);
			const ahead = Boolean(w.branch && w.branch !== main);
			try {
				const [status, committed, count] = await Promise.all([
					git(w.path, ["status", "--porcelain", "-z", "--untracked-files=all"]),
					ahead ? git(root, ["log", `${main}..${w.branch}`, "--name-only", "--format="]) : Promise.resolve(""),
					ahead ? git(root, ["rev-list", "--count", `${main}..${w.branch}`]) : Promise.resolve("0"),
				]);
				const { wip, staged } = parseStatus(status);
				return {
					branch,
					path: w.path,
					wip,
					staged,
					committed: [...new Set(committed.split("\n").filter(Boolean))],
					commits: Number(count.trim()) || 0,
					pr: prs?.find((p) => p.branch === w.branch) ?? null,
				};
			} catch {
				return null;
			}
		}),
	);
	const local = branches.filter((b): b is BranchGit => b !== null);
	// A pull request from a branch with no worktree here still counts.
	for (const p of prs ?? []) {
		if (!local.some((b) => b.branch === p.branch)) {
			local.push({ branch: p.branch, path: null, wip: [], staged: [], committed: p.files, commits: 0, pr: p });
		}
	}
	return { branches: local, prs, readAt: Date.now() };
}

export type FeatureRef = { id: string; slug: string; stageFolder: string; text: string };

/**
 * The top-level folders whose paths tie code to a feature: `config.codeRoots`, or for "auto" the tracked top-level
 * folders at HEAD minus the lifecycle folder and dot folders.
 */
export function resolveCodeRoots(root: string, config: GitBoardConfig): string[] {
	if (config.codeRoots !== "auto") return config.codeRoots.map((r) => r.replace(/\/+$/, "")).filter(Boolean);
	const lifecycle = config.roadmapDir.split(/[\\/]/).filter(Boolean)[0];
	try {
		return gitSync(root, ["ls-tree", "-d", "--name-only", "HEAD"])
			.split("\n")
			.filter((n) => n && !n.startsWith(".") && n !== lifecycle);
	} catch {
		return [];
	}
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Code paths each feature's markdown names, dropping paths named by more than `maxShare` features (too generic to tell). */
export function codeMentions(features: FeatureRef[], roots: string[], maxShare = 4): Map<string, Set<string>> {
	const byPath = new Map<string, Set<string>>();
	if (!roots.length) return byPath;
	const codePath = new RegExp(
		`(?:^|[\\s\`(["'])((?:${roots.map(escapeRe).join("|")})/[\\w./()[\\]@+-]*[\\w/)\\]])`,
		"g",
	);
	for (const f of features) {
		for (const m of f.text.matchAll(codePath)) {
			const p = m[1].replace(/[.)\]]+$/, "").replace(/:\d+(-\d+)?$/, "");
			if (p.length < 6) continue;
			if (!byPath.has(p)) byPath.set(p, new Set());
			byPath.get(p)?.add(f.id);
		}
	}
	for (const [p, ids] of byPath) if (ids.size > maxShare) byPath.delete(p);
	return byPath;
}

/**
 * Tie each branch's work to features: a change under a feature's lifecycle folder, a branch whose name carries
 * the feature's slug (all its work counts), or a changed file the feature's markdown names (exact path, or under
 * a named folder ending in `/`).
 */
export function attributeGit(
	pipeline: Pipeline,
	features: FeatureRef[],
	opts: { roadmapDir: string; codeRoots: string[] },
): Map<string, CardGit[]> {
	const out = new Map<string, CardGit[]>();
	const lifecycle = opts.roadmapDir.split(/[\\/]/).filter(Boolean);
	const depth = lifecycle.length;
	const lifecyclePrefix = `${lifecycle.join("/")}/`;
	const byKey = new Map(features.map((f) => [`${f.stageFolder}/${f.slug}`, f.id]));
	const slugs = features.filter((f) => f.slug.includes("-") && f.slug.length >= 6);
	const mentions = codeMentions(features, opts.codeRoots);
	const dirs = [...mentions.keys()].filter((p) => p.endsWith("/"));

	const featuresFor = (file: string): string[] => {
		if (file.startsWith(lifecyclePrefix)) {
			const parts = file.split("/").slice(depth);
			if (parts.length < 2) return [];
			const id = byKey.get(`${parts[0]}/${parts[1].replace(/\.md$/, "")}`);
			return id ? [id] : [];
		}
		const ids = new Set(mentions.get(file) ?? []);
		for (const d of dirs) if (file.startsWith(d)) for (const id of mentions.get(d) ?? []) ids.add(id);
		return [...ids];
	};

	for (const b of pipeline.branches) {
		const named = slugs.filter((f) => b.branch.toLowerCase().includes(f.slug.toLowerCase())).map((f) => f.id);
		const per = new Map<string, { wip: string[]; staged: string[]; committed: string[]; via: CardGit["via"] }>();
		const add = (id: string, bucket: "wip" | "staged" | "committed", file: string, via: CardGit["via"]) => {
			if (!per.has(id)) per.set(id, { wip: [], staged: [], committed: [], via });
			const e = per.get(id);
			if (!e) return;
			if (!e[bucket].includes(file)) e[bucket].push(file);
			if (via === "roadmap" || (via === "branch" && e.via === "code")) e.via = via;
		};
		for (const bucket of ["wip", "staged", "committed"] as const) {
			for (const file of b[bucket]) {
				for (const id of named) add(id, bucket, file, "branch");
				for (const id of featuresFor(file)) add(id, bucket, file, file.startsWith(lifecyclePrefix) ? "roadmap" : "code");
			}
		}
		if (b.pr) for (const id of named) if (!per.has(id)) per.set(id, { wip: [], staged: [], committed: [], via: "branch" });
		for (const [id, e] of per) {
			const row: CardGit = {
				branch: b.branch,
				wip: e.wip.length,
				staged: e.staged.length,
				committed: e.committed.length,
				commits: b.commits,
				pr: b.pr
					? {
							number: b.pr.number,
							url: b.pr.url,
							draft: b.pr.draft,
							title: b.pr.title,
							checks: b.pr.checks,
							review: b.pr.review,
							conflicts: b.pr.conflicts,
						}
					: null,
				files: { wip: e.wip.slice(0, 15), staged: e.staged.slice(0, 15), committed: e.committed.slice(0, 15) },
				via: e.via,
			};
			out.set(id, [...(out.get(id) ?? []), row]);
		}
	}
	return out;
}
