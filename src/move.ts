// SPDX-License-Identifier: MIT
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type GitBoardConfig, stageById } from "./config.js";
import { dirtyPaths, featureDirt, git, gitCommonDir, unlandedRoadmapWork } from "./git.js";
import { gateCommands, resolveHooks, runGate } from "./hooks.js";
import { LINK_FILE, isRewriteSkipped, mapPath, rewriteFile } from "./links.js";
import { SLUG_RE } from "./lint.js";
import type { MoveInput, MovePlan, MoveResult, PathMove } from "./types.js";

function safeSlug(slug: string): string {
	return slug.toLowerCase();
}

function trackedFiles(cwd: string): string[] {
	return git(cwd, ["ls-files", "-z"]).split("\0").filter(Boolean);
}

function existsIn(files: string[]): (p: string) => boolean {
	const set = new Set(files);
	for (const f of files) {
		let d = path.posix.dirname(f);
		while (d !== "." && !set.has(d)) {
			set.add(d);
			d = path.posix.dirname(d);
		}
	}
	return (p) => set.has(p);
}

/** Unticked `- [ ]` items in a markdown file. */
function countOpenTicks(text: string): number {
	return text.split("\n").filter((l) => /^\s*[-*] \[ \]/.test(l)).length;
}

/** Every rewrite the move makes, computed against `cwd`'s tracked files without writing. */
function computeRewrites(
	cwd: string,
	config: GitBoardConfig,
	files: string[],
	moves: PathMove[],
	tokens: PathMove[],
): Map<string, string> {
	const exists = existsIn(files);
	const out = new Map<string, string>();
	for (const f of files) {
		if (!LINK_FILE.test(f) || isRewriteSkipped(f, config.rewriteSkip)) continue;
		let text: string;
		try {
			text = fs.readFileSync(path.join(cwd, f), "utf8");
		} catch {
			continue;
		}
		const next = rewriteFile(f, text, moves, exists, tokens);
		if (next !== text) out.set(f, next);
	}
	return out;
}

/** What a move would do, read from the main checkout. Nothing is written. */
export function planMove(root: string, config: GitBoardConfig, input: MoveInput): MovePlan {
	const { slug, from, to } = input;
	const plan: MovePlan = {
		...input,
		moves: [],
		rewrites: [],
		blocked: null,
		warnings: [],
		hooks: [],
		files: 0,
		subject: "",
		base: "",
		branch: `gitboard-move/${safeSlug(slug)}-`,
	};
	let fromStage: ReturnType<typeof stageById>;
	let toStage: ReturnType<typeof stageById>;
	try {
		fromStage = stageById(config, from);
		toStage = stageById(config, to);
	} catch (error) {
		return { ...plan, blocked: (error as Error).message };
	}
	plan.subject = `gitboard: move ${slug} to ${toStage.name}`;
	if (!SLUG_RE.test(slug)) return { ...plan, blocked: "That is not a feature: slugs use letters, digits, - and _ only." };
	if (from === to) return { ...plan, blocked: "It is already there." };

	const fromBase = `${config.roadmapDir}/${fromStage.folder}/${slug}`;
	const toBase = `${config.roadmapDir}/${toStage.folder}/${slug}`;
	const files = trackedFiles(root);
	const exists = existsIn(files);
	for (const suffix of [".md", ""]) {
		if (exists(fromBase + suffix)) plan.moves.push({ from: fromBase + suffix, to: toBase + suffix });
	}
	if (!plan.moves.length) return { ...plan, blocked: `It is not committed in ${fromStage.name}.` };
	if ([toBase, `${toBase}.md`].some((p) => exists(p) || fs.existsSync(path.join(root, p)))) {
		return { ...plan, blocked: `${toStage.name} already has a feature with this name.` };
	}
	if (git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() !== config.mainBranch) {
		return { ...plan, blocked: `The main checkout is not on ${config.mainBranch}.` };
	}
	// The whole feature, not only its tracked files: untracked, modified or ignored content would be left behind.
	const dirty = featureDirt(root, [fromBase, `${fromBase}.md`]);
	if (dirty.length) {
		return { ...plan, blocked: `It has uncommitted changes (untracked, modified or ignored files) in the main checkout: ${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? ", ..." : ""}. Commit or remove them first.` };
	}

	const tokens = [{ from: `${fromStage.folder}/${slug}`, to: `${toStage.folder}/${slug}` }];
	plan.rewrites = [...computeRewrites(root, config, files, plan.moves, tokens).keys()];
	plan.files = files.filter((f) => plan.moves.some((m) => f === m.from || f.startsWith(`${m.from}/`))).length;
	plan.base = git(root, ["rev-parse", "--short", config.mainBranch]).trim();
	const dirtyRewrites = plan.rewrites.length ? dirtyPaths(root, plan.rewrites) : [];
	if (dirtyRewrites.length) {
		return { ...plan, blocked: `Files that link to it have uncommitted changes in the main checkout: ${dirtyRewrites.join(", ")}.` };
	}

	const inside = (p: string) => plan.moves.some((m) => p === m.from || p.startsWith(`${m.from}/`));
	for (const w of unlandedRoadmapWork(root, config.roadmapDir, config.mainBranch)) {
		if (w.path === root) continue;
		if ([...w.ahead, ...w.dirty].some(inside)) {
			plan.blocked = `${w.branch} has roadmap work for it that is not on ${config.mainBranch}. Land it first.`;
			return plan;
		}
	}

	if (to === config.stages.length) {
		const list = plan.moves.find((m) => m.from.endsWith(".md"));
		const open = list ? countOpenTicks(fs.readFileSync(path.join(root, list.from), "utf8")) : 0;
		if (open) plan.warnings.push(`${open} ${open === 1 ? "item is" : "items are"} not ticked.`);
	}
	plan.hooks = gateCommands(config, resolveHooks(config, input, toBase));
	return plan;
}

function holderOf(lock: string): number | null | undefined {
	try {
		const pid = Number(fs.readFileSync(lock, "utf8").trim());
		return Number.isInteger(pid) && pid > 0 ? pid : null;
	} catch {
		return undefined;
	}
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process exists under another user.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * Take the one-move lock atomically: the pid goes into a temp file that is hard-linked to the lock path, so the
 * lock never exists without its pid and EEXIST means it is held. A lock whose process is gone is taken over.
 */
function takeLock(lock: string): void {
	const tmp = `${lock}.${process.pid}.${randomBytes(4).toString("hex")}`;
	fs.writeFileSync(tmp, String(process.pid));
	try {
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				fs.linkSync(tmp, lock);
				return;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
			const holder = holderOf(lock);
			if (holder === undefined) continue;
			if (holder !== null && isAlive(holder)) break;
			// Stale: remove it only if it is still the same stale lock.
			if (holderOf(lock) === holder) fs.rmSync(lock, { force: true });
		}
		throw new Error("Another move is running. Try again in a moment.");
	} finally {
		fs.rmSync(tmp, { force: true });
	}
}

/** Remove the lock only when it still holds our pid. */
function releaseLock(lock: string): void {
	if (holderOf(lock) === process.pid) fs.rmSync(lock, { force: true });
}

/** Remove `dir` and its subfolders when they hold nothing but empty folders and `.DS_Store` files. Returns whether `dir` is gone. */
function pruneEmptyDirs(dir: string): boolean {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	let left = 0;
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory() && pruneEmptyDirs(p)) continue;
		if (e.isFile() && e.name === ".DS_Store") {
			fs.rmSync(p, { force: true });
			continue;
		}
		left++;
	}
	if (left) return false;
	fs.rmdirSync(dir);
	return true;
}

/**
 * One try at the move, from the current tip of the main branch, in its own locked worktree on a
 * `gitboard-move/` branch: `git mv`, rewrite links, run hooks and the lint gate, commit once with the base
 * recorded, then fast-forward the main branch. Returns null when the main branch moved meanwhile (the caller
 * redoes the whole move from the new tip). A commit that fails after it exists is kept as `archive/<branch>`.
 */
function attemptMove(root: string, config: GitBoardConfig, input: MoveInput, stamp: string, final: boolean): MoveResult | null {
	const main = config.mainBranch;
	const safe = safeSlug(input.slug);
	const branch = `gitboard-move/${safe}-${stamp}`;
	const wt = path.join(root, ".worktrees", `gitboard-move-${safe}-${stamp}`);
	let added = false;
	let landed = false;
	try {
		const plan = planMove(root, config, input);
		if (plan.blocked) throw new Error(plan.blocked);
		const fromFolder = stageById(config, input.from).folder;
		const toFolder = stageById(config, input.to).folder;

		// A crashed move can leave a worktree entry whose folder is gone; clear those before adding ours.
		git(root, ["worktree", "prune"]);
		const base = git(root, ["rev-parse", main]).trim();
		// Locked, so no other tool's worktree cleanup removes it mid-move.
		git(root, ["worktree", "add", "-q", "--lock", "--reason", `gitboard move of ${input.slug}`, "-b", branch, wt, base]);
		added = true;
		for (const m of plan.moves) {
			fs.mkdirSync(path.dirname(path.join(wt, m.to)), { recursive: true });
			git(wt, ["mv", m.from, m.to]);
		}
		// git does not track empty folders: when the feature was the last thing in its stage, keep the stage with a .gitkeep, as init does.
		const fromDir = `${config.roadmapDir}/${fromFolder}`;
		if (!git(wt, ["ls-files", "-z", "--", fromDir]).length) {
			fs.mkdirSync(path.join(wt, fromDir), { recursive: true });
			fs.writeFileSync(path.join(wt, fromDir, ".gitkeep"), "");
		}

		// Links are resolved against the tree before the rename, then written into the moved places.
		const before = git(wt, ["ls-files", "-z"])
			.split("\0")
			.filter(Boolean)
			.map((f) => plan.moves.reduce((p, m) => (p === m.to || p.startsWith(`${m.to}/`) ? m.from + p.slice(m.to.length) : p), f));
		const tokens = [{ from: `${fromFolder}/${input.slug}`, to: `${toFolder}/${input.slug}` }];
		const exists = existsIn(before);
		for (const oldPath of before) {
			if (!LINK_FILE.test(oldPath) || isRewriteSkipped(oldPath, config.rewriteSkip)) continue;
			const now = mapPath(oldPath, plan.moves) ?? oldPath;
			const abs = path.join(wt, now);
			const text = fs.readFileSync(abs, "utf8");
			const next = rewriteFile(oldPath, text, plan.moves, exists, tokens);
			if (next !== text) fs.writeFileSync(abs, next);
		}

		// Stage folders the main checkout has on disk but git does not track (empty ones) still count for lint.
		for (const s of config.stages) {
			const dir = path.join(root, config.roadmapDir, s.folder);
			if (fs.existsSync(dir)) fs.mkdirSync(path.join(wt, config.roadmapDir, s.folder), { recursive: true });
		}
		runGate(wt, config, plan.hooks);

		// The worktree is fresh from the main branch, so everything in it is this move: one atomic commit.
		git(wt, ["add", "-A"]);
		const message = [
			plan.subject,
			"",
			`Moved on the board. Links rewritten in ${plan.rewrites.length} files.`,
			"",
			`GitBoard-Move: ${input.slug} ${input.from}->${input.to}`,
			`GitBoard-Base: ${base}`,
		].join("\n");
		git(wt, ["commit", "-q", "-m", message]);

		try {
			git(root, ["merge", "--ff-only", "-q", branch]);
		} catch (error) {
			if (git(root, ["rev-parse", main]).trim() === base) throw error;
			// The main branch moved while the worktree was open: this commit was checked against an old tree.
			if (final) throw new Error(`${main} moved again while the move ran. Try again.`);
			return null;
		}
		const head = git(wt, ["rev-parse", "HEAD"]).trim();
		if (git(root, ["rev-parse", main]).trim() !== head) throw new Error(`${main} did not land on the move commit.`);
		landed = true;
		return { plan, commit: head, branch };
	} catch (error) {
		// Keep any commit the move made that is not on the main branch.
		if (added && !landed && git(root, ["rev-list", "--count", `${main}..${branch}`]).trim() !== "0") {
			git(root, ["tag", "-a", `archive/${branch}`, "-m", `Move that did not land: ${(error as Error).message.split("\n")[0]}`, branch]);
			throw new Error(`${(error as Error).message} The move commit is kept as archive/${branch}.`);
		}
		throw error;
	} finally {
		if (added) {
			try {
				git(root, ["worktree", "unlock", wt]);
			} catch {
				/* already unlocked */
			}
			try {
				git(root, ["worktree", "remove", "--force", wt]);
			} catch {
				/* left for `git worktree prune` */
			}
			try {
				// -d after landing proves the branch is merged; a branch that did not land is archived above or superseded.
				git(root, ["branch", landed ? "-d" : "-D", branch]);
			} catch {
				/* already gone */
			}
		}
	}
}

/**
 * Move a feature between stages: `git mv` the list and folder in a locked worktree cut from the main branch,
 * rewrite links, run the hooks and the lint gate, commit once, fast-forward the main branch. If the main
 * branch moved while that ran, the whole move is redone once from the new tip (fresh rewrite, hooks, gate and
 * base) rather than replayed. Then empty leftover folders of the old place are removed. Never pushes.
 */
export function moveFeature(root: string, config: GitBoardConfig, input: MoveInput, opts: { now?: Date } = {}): MoveResult {
	const lock = path.join(gitCommonDir(root), "gitboard-move.lock");
	takeLock(lock);
	try {
		const stamp = (opts.now ?? new Date()).toISOString().replace(/\D/g, "").slice(0, 14);
		const result = attemptMove(root, config, input, stamp, false) ?? attemptMove(root, config, input, stamp, true);
		if (!result) throw new Error("The move did not land.");
		// git leaves empty folders (and a Finder's .DS_Store) behind in the main checkout.
		for (const m of result.plan.moves) pruneEmptyDirs(path.join(root, m.from));
		return result;
	} finally {
		releaseLock(lock);
	}
}
