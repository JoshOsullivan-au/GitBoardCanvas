// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, type GitBoardConfig } from "../src/config.js";
import { resolveHooks } from "../src/hooks.js";
import { runLint } from "../src/lint.js";
import { moveFeature, planMove } from "../src/move.js";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function write(root: string, rel: string, body: string) {
	fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	fs.writeFileSync(path.join(root, rel), body);
}

const R = "roadmap";
let root: string;
let config: GitBoardConfig;

const cfg = (over: Partial<GitBoardConfig> = {}): GitBoardConfig => ({ ...DEFAULT_CONFIG, ...over });
const worktreeCount = () => sh(root, "worktree", "list").trim().split("\n").length;
const noMoveBranches = () => expect(sh(root, "branch", "--list", "gitboard-move/*").trim()).toBe("");

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-move-")));
	config = cfg();
	sh(root, "init", "-q", "-b", "main");
	sh(root, "config", "user.email", "t@example.com");
	sh(root, "config", "user.name", "Test");
	sh(root, "config", "core.hooksPath", path.join(root, ".no-hooks"));
	sh(root, "config", "commit.gpgsign", "false");
	write(root, ".gitignore", ".worktrees\n");
	write(root, `${R}/3.open/ad-board.md`, "# Ad Board\n\n- [x] one\n- [ ] two\n\nFolder: [phases](./ad-board/README.md)\n");
	write(root, `${R}/3.open/ad-board/README.md`, "# Ad Board build\n\n[list](../ad-board.md) [daily](../daily-reporting.md)\n");
	write(root, `${R}/3.open/ad-board/phases/01-x.md`, "x\n");
	write(root, `${R}/3.open/daily-reporting.md`, "# Daily\n\n[ad board](./ad-board.md)\n");
	write(root, "docs/note.md", `See \`${R}/3.open/ad-board/\`.\n`);
	write(root, "CHANGELOG/log.md", `Shipped \`${R}/3.open/ad-board/\`.\n`);
	for (const s of ["1.ideas", "2.planning", "4.in-progress", "5.complete"]) write(root, `${R}/${s}/README.md`, "# Stage\n");
	sh(root, "add", "-A");
	sh(root, "commit", "-q", "-m", "init");
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe("planMove", () => {
	it("plans paths, rewrites, hooks, warnings and subject", () => {
		config = cfg({ hooks: { onEnter: { "5": ["echo {slug}"], "5.complete": ["echo {path}"] } }, lint: { ...DEFAULT_CONFIG.lint, command: "true" } });
		const plan = planMove(root, config, { slug: "ad-board", from: 3, to: 5 });
		expect(plan.blocked).toBeNull();
		expect(plan.moves.map((m) => m.to)).toEqual([`${R}/5.complete/ad-board.md`, `${R}/5.complete/ad-board`]);
		expect(plan.rewrites.sort()).toEqual([
			"CHANGELOG/log.md",
			"docs/note.md",
			`${R}/3.open/ad-board/README.md`,
			`${R}/3.open/daily-reporting.md`,
		]);
		expect(plan.warnings).toEqual(["1 item is not ticked."]);
		expect(plan.hooks).toEqual(["echo 'ad-board'", `echo '${R}/5.complete/ad-board'`, "gitboard lint", "true"]);
		expect(plan.files).toBe(3);
		expect(plan.subject).toBe("gitboard: move ad-board to Complete");
		expect(plan.base).toBe(sh(root, "rev-parse", "--short", "main").trim());
		expect(plan.branch).toBe("gitboard-move/ad-board-");
	});

	it("shell-quotes placeholders", () => {
		expect(resolveHooks(cfg({ hooks: { onEnter: { "4": ["echo {slug}"] } } }), { slug: "it's", from: 3, to: 4 }, "p")).toEqual([
			"echo 'it'\\''s'",
		]);
	});

	it("refuses an existing target, a missing feature, a bad slug and a no-op", () => {
		write(root, `${R}/4.in-progress/ad-board.md`, "# Other\n");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "clash");
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toMatch(/already has/);
		expect(planMove(root, config, { slug: "nope", from: 3, to: 4 }).blocked).toMatch(/not committed/);
		expect(planMove(root, config, { slug: "../x", from: 3, to: 4 }).blocked).toMatch(/not a feature/);
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 3 }).blocked).toMatch(/already there/);
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 9 }).blocked).toMatch(/Unknown stage/);
	});

	it("refuses when a worktree has unlanded roadmap work for the feature", () => {
		const wt = path.join(root, ".worktrees", "session");
		sh(root, "worktree", "add", "-q", "-b", "session", wt, "main");
		write(wt, `${R}/3.open/ad-board/phases/02-y.md`, "y\n");
		sh(wt, "add", "-A");
		sh(wt, "commit", "-q", "-m", "phase 02");
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toMatch(/session has roadmap work/);
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/session has roadmap work/);
		expect(sh(root, "tag", "--list", "archive/*").trim()).toBe("");
	});
});

describe("moveFeature", () => {
	it("moves in a worktree, lands on main, rewrites links, skips rewriteSkip and cleans up", () => {
		config = cfg({ rewriteSkip: ["CHANGELOG/"] });
		const { commit } = moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		expect(sh(root, "rev-parse", "HEAD").trim()).toBe(commit);
		expect(sh(root, "log", "-1", "--format=%s").trim()).toBe("gitboard: move ad-board to In progress");
		expect(fs.existsSync(path.join(root, `${R}/4.in-progress/ad-board/phases/01-x.md`))).toBe(true);
		expect(fs.existsSync(path.join(root, `${R}/3.open/ad-board.md`))).toBe(false);
		expect(fs.readFileSync(path.join(root, `${R}/3.open/daily-reporting.md`), "utf8")).toContain("(../4.in-progress/ad-board.md)");
		expect(fs.readFileSync(path.join(root, `${R}/4.in-progress/ad-board/README.md`), "utf8")).toContain("[daily](../../3.open/daily-reporting.md)");
		expect(fs.readFileSync(path.join(root, "docs/note.md"), "utf8")).toContain(`${R}/4.in-progress/ad-board/`);
		expect(fs.readFileSync(path.join(root, "CHANGELOG/log.md"), "utf8")).toContain(`${R}/3.open/ad-board/`);
		expect(worktreeCount()).toBe(1);
		noMoveBranches();
		expect(sh(root, "status", "--porcelain").trim()).toBe("");
		expect(fs.existsSync(path.join(root, ".git", "gitboard-move.lock"))).toBe(false);
	});

	it("records the move and its base in trailers", () => {
		const base = sh(root, "rev-parse", "main").trim();
		moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		const body = sh(root, "log", "-1", "--format=%B");
		expect(body).toContain("GitBoard-Move: ad-board 3->4");
		expect(body).toContain(`GitBoard-Base: ${base}`);
		expect(sh(root, "log", "-1", "--format=%P").trim()).toBe(base);
		expect(sh(root, "worktree", "list", "--porcelain")).not.toContain("locked");
		expect(sh(root, "tag", "--list", "archive/*").trim()).toBe("");
	});

	it("runs the target stage hooks in the worktree before the commit", () => {
		config = cfg({ hooks: { onEnter: { "5.complete": ["echo {slug} {from}-{to} > hook-ran.txt"] } } });
		moveFeature(root, config, { slug: "ad-board", from: 3, to: 5 });
		expect(fs.readFileSync(path.join(root, "hook-ran.txt"), "utf8").trim()).toBe("ad-board 3.open-5.complete");
		expect(sh(root, "log", "-1", "--name-only", "--format=").split("\n")).toContain("hook-ran.txt");
	});

	it("leaves main untouched when a hook fails", () => {
		const head = sh(root, "rev-parse", "HEAD");
		config = cfg({ hooks: { onEnter: { "4": ["echo boom >&2; exit 3"] } } });
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/boom/);
		expect(sh(root, "rev-parse", "HEAD")).toBe(head);
		expect(worktreeCount()).toBe(1);
		noMoveBranches();
		expect(sh(root, "tag", "--list", "archive/*").trim()).toBe("");
	});

	it("leaves main untouched when the built-in lint fails", () => {
		write(root, `${R}/3.open/ad-board/phases/bad.md`, "x\n");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "bad phase name");
		const head = sh(root, "rev-parse", "HEAD");
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/L4:/);
		expect(sh(root, "rev-parse", "HEAD")).toBe(head);
		expect(worktreeCount()).toBe(1);
		noMoveBranches();
	});

	it("leaves main untouched when lint.command fails", () => {
		const head = sh(root, "rev-parse", "HEAD");
		config = cfg({ lint: { ...DEFAULT_CONFIG.lint, command: "echo nope >&2; exit 1" } });
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/nope/);
		expect(sh(root, "rev-parse", "HEAD")).toBe(head);
	});

	it("refuses a feature with uncommitted changes in the main checkout", () => {
		write(root, `${R}/3.open/ad-board.md`, "# Ad Board\n\nedited\n");
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toMatch(/uncommitted changes/);
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/uncommitted changes/);
	});

	it("redoes the move from the new tip and lands when main moved on unrelated files", () => {
		config = cfg({
			hooks: {
				onEnter: {
					"4": [`[ -f ${JSON.stringify(path.join(root, "other.txt"))} ] || { printf other > ${JSON.stringify(path.join(root, "other.txt"))} && git -C ${JSON.stringify(root)} add other.txt && git -C ${JSON.stringify(root)} commit -q -m other; }`],
				},
			},
		});
		const { commit } = moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		expect(sh(root, "rev-parse", "main").trim()).toBe(commit);
		expect(sh(root, "log", "-2", "--format=%s").split("\n")[1]).toBe("other");
		expect(fs.existsSync(path.join(root, "other.txt"))).toBe(true);
		expect(fs.existsSync(path.join(root, `${R}/4.in-progress/ad-board.md`))).toBe(true);
	});

	it("redoes the whole move when main moved: late links are rewritten and the base is the new tip", () => {
		const late = path.join(root, R, "3.open", "late.md");
		const note = path.join(root, "docs", "late.md");
		const g = JSON.stringify(root);
		config = cfg({
			hooks: {
				onEnter: {
					"4": [
						`[ -f ${JSON.stringify(late)} ] || { printf '[ab](./ad-board.md)\\n' > ${JSON.stringify(late)} && printf 'see ${R}/3.open/ad-board/\\n' > ${JSON.stringify(note)} && git -C ${g} add -A && git -C ${g} commit -q -m late; }`,
					],
				},
			},
		});
		const { commit } = moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		const tip = sh(root, "rev-parse", "HEAD~1").trim();
		expect(sh(root, "log", "-1", "--format=%P").trim()).toBe(tip);
		expect(sh(root, "log", "-2", "--format=%s").split("\n")[1]).toBe("late");
		expect(sh(root, "log", "-1", "--format=%B", commit)).toContain(`GitBoard-Base: ${tip}`);
		expect(fs.readFileSync(late, "utf8")).toContain("(../4.in-progress/ad-board.md)");
		expect(fs.readFileSync(note, "utf8")).toContain(`${R}/4.in-progress/ad-board/`);
		expect(runLint(root, config).ok).toBe(true);
		expect(worktreeCount()).toBe(1);
		noMoveBranches();
		expect(sh(root, "tag", "--list", "archive/*").trim()).toBe("");
	});

	it("refuses and archives the commit when main moves again during the redo", () => {
		config = cfg({ hooks: { onEnter: { "4": [`git -C ${JSON.stringify(root)} commit -q --allow-empty -m other`] } } });
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/moved again[\s\S]*kept as archive\/gitboard-move\/ad-board-/);
		expect(sh(root, "log", "-1", "--format=%s").trim()).toBe("other");
		expect(fs.existsSync(path.join(root, `${R}/3.open/ad-board.md`))).toBe(true);
		expect(sh(root, "tag", "--list", "archive/gitboard-move/*").trim()).toMatch(/^archive\/gitboard-move\/ad-board-\d{14}$/);
		noMoveBranches();
		expect(worktreeCount()).toBe(1);
	});

	it("refuses untracked, ignored and modified content under the feature, then lands once it is gone", () => {
		const head = sh(root, "rev-parse", "HEAD");
		write(root, `${R}/3.open/ad-board/docs/draft.txt`, "wip\n");
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/uncommitted changes[\s\S]*docs\/draft\.txt/);
		fs.rmSync(path.join(root, `${R}/3.open/ad-board/docs`), { recursive: true });
		write(root, ".gitignore", ".worktrees\n*.log\n");
		sh(root, "commit", "-q", "-am", "ignore logs");
		write(root, `${R}/3.open/ad-board/run.log`, "log\n");
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toMatch(/run\.log/);
		fs.rmSync(path.join(root, `${R}/3.open/ad-board/run.log`));
		write(root, `${R}/3.open/ad-board.md`, "# Ad Board\n\nedited\n");
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toMatch(/ad-board\.md/);
		expect(sh(root, "rev-parse", "HEAD")).not.toBe(head);
		sh(root, "checkout", "-q", "--", `${R}/3.open/ad-board.md`);
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toBeNull();
	});

	it("removes empty folders and .DS_Store left in the old place after landing", () => {
		fs.mkdirSync(path.join(root, `${R}/3.open/ad-board/mocks/empty`), { recursive: true });
		write(root, `${R}/3.open/ad-board/phases/.DS_Store`, "junk");
		write(root, `${R}/3.open/ad-board/.DS_Store`, "junk");
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 4 }).blocked).toBeNull();
		moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		expect(fs.existsSync(path.join(root, `${R}/3.open/ad-board`))).toBe(false);
		expect(fs.existsSync(path.join(root, `${R}/3.open`))).toBe(true);
		expect(fs.existsSync(path.join(root, `${R}/4.in-progress/ad-board/phases/01-x.md`))).toBe(true);
	});

	it("keeps a stage folder in git with a .gitkeep when its last feature moves out", () => {
		moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		expect(sh(root, "ls-files", `${R}/3.open`).trim()).toBe(`${R}/3.open/daily-reporting.md`);
		moveFeature(root, config, { slug: "daily-reporting", from: 3, to: 4 });
		expect(sh(root, "ls-files", `${R}/3.open`).trim()).toBe(`${R}/3.open/.gitkeep`);
		expect(fs.existsSync(path.join(root, `${R}/3.open`))).toBe(true);
		expect(runLint(root, config).problems).toEqual([]);
		// A fresh clone has the folder too, not only the checkout that ran the move.
		const clone = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-clone-"));
		try {
			sh(clone, "clone", "-q", root, ".");
			expect(fs.existsSync(path.join(clone, `${R}/3.open/.gitkeep`))).toBe(true);
		} finally {
			fs.rmSync(clone, { recursive: true, force: true });
		}
	});

	it("refuses when the target holds either the folder or the list", () => {
		write(root, `${R}/3.open/solo/README.md`, "# Solo\n");
		write(root, `${R}/4.in-progress/solo.md`, "# Solo list\n");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "solo");
		expect(planMove(root, config, { slug: "solo", from: 3, to: 4 }).blocked).toMatch(/already has/);
		fs.mkdirSync(path.join(root, `${R}/5.complete/ad-board`));
		expect(planMove(root, config, { slug: "ad-board", from: 3, to: 5 }).blocked).toMatch(/already has/);
	});

	it("refuses slugs outside letters, digits, - and _", () => {
		for (const slug of ["has space", "a.b", "a/b", "-lead", "sp\u00e9cial"]) {
			expect(planMove(root, config, { slug, from: 3, to: 4 }).blocked).toMatch(/not a feature/);
		}
		write(root, `${R}/3.open/under_score.md`, "# U\n");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "u");
		expect(planMove(root, config, { slug: "under_score", from: 3, to: 4 }).blocked).toBeNull();
	});

	it("takes over a lock left by a process that is gone, and refuses a live one", () => {
		const lock = path.join(root, ".git", "gitboard-move.lock");
		fs.writeFileSync(lock, "999999");
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).not.toThrow();
		expect(fs.existsSync(lock)).toBe(false);
		fs.writeFileSync(lock, String(process.pid));
		expect(() => moveFeature(root, config, { slug: "daily-reporting", from: 3, to: 4 })).toThrow(/Another move/);
		expect(fs.existsSync(lock)).toBe(true);
		fs.rmSync(lock);
	});

	it("never treats an old lock as stale while its process is alive, and EPERM counts as alive", () => {
		const lock = path.join(root, ".git", "gitboard-move.lock");
		fs.writeFileSync(lock, String(process.pid));
		const old = new Date(Date.now() - 3 * 3600_000);
		fs.utimesSync(lock, old, old);
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/Another move/);
		fs.writeFileSync(lock, "1");
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).toThrow(/Another move/);
		expect(fs.readFileSync(lock, "utf8")).toBe("1");
		fs.writeFileSync(lock, "");
		expect(() => moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 })).not.toThrow();
	});

	it("leaves no temp lock files, and removes the lock only if it still holds our pid", () => {
		moveFeature(root, config, { slug: "ad-board", from: 3, to: 4 });
		expect(fs.readdirSync(path.join(root, ".git")).filter((f) => f.startsWith("gitboard-move.lock"))).toEqual([]);
		const lock = path.join(root, ".git", "gitboard-move.lock");
		config = cfg({ hooks: { onEnter: { "5": [`printf 999999 > ${JSON.stringify(lock)}`] } } });
		moveFeature(root, config, { slug: "daily-reporting", from: 3, to: 5 });
		expect(fs.readFileSync(lock, "utf8")).toBe("999999");
	});
});
