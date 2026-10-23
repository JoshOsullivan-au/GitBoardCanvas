// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import type { GitBoardConfig } from "./config.js";
import { GIT_ENV, git as gitSync, listWorktrees } from "./git.js";
import type { CardGit } from "./types.js";

const run = promisify(execFile);

/** Where work on a branch stands: edited, staged, committed but not on main, in an open pull request. */
export type PullRequest = { number: number; title: string; url: string; draft: boolean; branch: string; files: string[] };

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

const prCache = new Map<string, { at: number; prs: PullRequest[] | null }>();

/** Open pull requests through the GitHub CLI, read only, cached for a minute per repo. */
async function openPullRequests(root: string, now = Date.now()): Promise<PullRequest[] | null> {
	const hit = prCache.get(root);
	if (hit && now - hit.at < 60_000) return hit.prs;
	let prs: PullRequest[] | null;
	try {
		const { stdout } = await run(
			"gh",
			["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,url,isDraft,headRefName,files"],
			{ cwd: root, encoding: "utf8", timeout: 20_000, maxBuffer: 16 * 1024 * 1024 },
		);
		const rows = JSON.parse(stdout) as {
			number: number;
			title: string;
			url: string;
			isDraft: boolean;
			headRefName: string;
			files?: { path: string }[];
		}[];
		prs = rows.map((r) => ({
			number: r.number,
			title: r.title,
			url: r.url,
			draft: r.isDraft,
			branch: r.headRefName,
			files: (r.files ?? []).map((f) => f.path),
		}));
	} catch {
		prs = null;
	}
	prCache.set(root, { at: now, prs });
	return prs;
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
				pr: b.pr ? { number: b.pr.number, url: b.pr.url, draft: b.pr.draft, title: b.pr.title } : null,
				files: { wip: e.wip.slice(0, 15), staged: e.staged.slice(0, 15), committed: e.committed.slice(0, 15) },
				via: e.via,
			};
			out.set(id, [...(out.get(id) ?? []), row]);
		}
	}
	return out;
}
