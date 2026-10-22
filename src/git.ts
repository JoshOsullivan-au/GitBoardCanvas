// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

/** Run git in `cwd` and return stdout; throws with git's stderr on a non-zero exit. */
export function git(cwd: string, args: string[]): string {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
		throw new Error(stderr || `git ${args.join(" ")} failed`);
	}
}

export type Worktree = { path: string; branch: string | null; head: string };

export function listWorktrees(cwd: string): Worktree[] {
	const out: Worktree[] = [];
	let cur: Partial<Worktree> = {};
	for (const line of git(cwd, ["worktree", "list", "--porcelain"]).split("\n")) {
		if (line.startsWith("worktree ")) cur = { path: line.slice(9), branch: null };
		else if (line.startsWith("HEAD ")) cur.head = line.slice(5);
		else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
		else if (line === "" && cur.path) {
			out.push(cur as Worktree);
			cur = {};
		}
	}
	if (cur.path) out.push(cur as Worktree);
	return out;
}

/** The main checkout: the first worktree git lists. GitBoard reads and moves its roadmap, whichever worktree starts it. */
export function mainCheckout(cwd = process.cwd()): string {
	return listWorktrees(cwd)[0]?.path ?? cwd;
}

/** The top of the repo `cwd` sits in. */
export function repoRoot(cwd = process.cwd()): string {
	return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

/** Repo-relative paths with uncommitted changes under `pathspec`. */
export function dirtyPaths(cwd: string, pathspec: string[]): string[] {
	const out = git(cwd, ["status", "--porcelain", "--untracked-files=all", "--", ...pathspec]);
	return out
		.split("\n")
		.filter(Boolean)
		.map((l) => l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""));
}

/** Repo-relative paths under `pathspec` that are modified, untracked or ignored. A stray `.DS_Store` does not count. */
export function featureDirt(cwd: string, pathspec: string[]): string[] {
	const out = git(cwd, ["status", "--porcelain", "--ignored", "--untracked-files=all", "--", ...pathspec]);
	return out
		.split("\n")
		.filter(Boolean)
		.map((l) => l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""))
		.filter((f) => path.posix.basename(f) !== ".DS_Store");
}

/** Roadmap changes not on the main branch, per worktree: commits on its branch and uncommitted files. */
export function unlandedRoadmapWork(
	root: string,
	roadmapDir: string,
	mainBranch: string,
): { branch: string; path: string; dirty: string[]; ahead: string[] }[] {
	const out: { branch: string; path: string; dirty: string[]; ahead: string[] }[] = [];
	for (const wt of listWorktrees(root)) {
		const branch = wt.branch ?? wt.head.slice(0, 8);
		let ahead: string[] = [];
		if (wt.branch && wt.branch !== mainBranch) {
			try {
				ahead = git(root, ["log", `${mainBranch}..${wt.branch}`, "--name-only", "--format=", "--", roadmapDir])
					.split("\n")
					.filter(Boolean);
			} catch {
				ahead = [];
			}
		}
		let dirty: string[] = [];
		try {
			dirty = dirtyPaths(wt.path, [roadmapDir]);
		} catch {
			dirty = [];
		}
		if (ahead.length || dirty.length) out.push({ branch, path: wt.path, dirty, ahead: [...new Set(ahead)] });
	}
	return out;
}

/** Changes whenever the main branch moves, the roadmap is edited on disk, or a worktree commits. */
export function boardVersion(root: string, roadmapDir: string, mainBranch: string): string {
	const h = createHash("sha1");
	h.update(git(root, ["rev-parse", mainBranch]));
	h.update(git(root, ["status", "--porcelain", "--untracked-files=all", "--", roadmapDir]));
	for (const wt of listWorktrees(root)) h.update(`${wt.path}:${wt.head}`);
	return h.digest("hex").slice(0, 16);
}

export function gitCommonDir(root: string): string {
	return path.resolve(root, git(root, ["rev-parse", "--git-common-dir"]).trim());
}
