// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../src/config.js";
import { init } from "../src/init.js";
import { runLint } from "../src/lint.js";
import { moveFeature } from "../src/move.js";

const dirs: string[] = [];
const tmp = () => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-init-"));
	dirs.push(d);
	return d;
};

afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("init", () => {
	it("creates every stage folder with its README, the feature templates and the config", () => {
		const root = tmp();
		const { created } = init(root, DEFAULT_CONFIG);
		for (const s of DEFAULT_CONFIG.stages) expect(fs.existsSync(path.join(root, "roadmap", s.folder, "README.md"))).toBe(true);
		expect(created).toContain("gitboard.config.json");
		expect(created).toContain("roadmap/README.md");
		expect(fs.existsSync(path.join(root, "roadmap/templates/feature/phases/01-first-phase.md"))).toBe(true);
	});

	it("never overwrites an existing file", () => {
		const root = tmp();
		fs.writeFileSync(path.join(root, "gitboard.config.json"), '{"roadmapDir":"roadmap"}\n');
		init(root, DEFAULT_CONFIG);
		fs.writeFileSync(path.join(root, "roadmap/README.md"), "mine\n");
		const second = init(root, DEFAULT_CONFIG);
		expect(second.created).toEqual([]);
		expect(second.skipped).toContain("roadmap/README.md");
		expect(fs.readFileSync(path.join(root, "gitboard.config.json"), "utf8")).toBe('{"roadmapDir":"roadmap"}\n');
		expect(fs.readFileSync(path.join(root, "roadmap/README.md"), "utf8")).toBe("mine\n");
	});

	it("follows custom stages", () => {
		const root = tmp();
		const config = {
			...DEFAULT_CONFIG,
			roadmapDir: "plans",
			stages: [
				{ folder: "1.backlog", name: "Backlog" },
				{ folder: "2.done", name: "Done" },
			],
		};
		init(root, config);
		expect(fs.readdirSync(path.join(root, "plans")).filter((f) => /^\d\./.test(f)).sort()).toEqual(["1.backlog", "2.done"]);
		expect(fs.existsSync(path.join(root, "plans/1.backlog/.gitkeep"))).toBe(true);
	});

	it("adds .worktrees/ to .gitignore, creating the file or keeping every other line", () => {
		const root = tmp();
		expect(init(root, DEFAULT_CONFIG).created).toContain(".gitignore");
		expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(".worktrees/\n");
		const other = tmp();
		fs.writeFileSync(path.join(other, ".gitignore"), "node_modules\ndist");
		init(other, DEFAULT_CONFIG);
		expect(fs.readFileSync(path.join(other, ".gitignore"), "utf8")).toBe("node_modules\ndist\n.worktrees/\n");
		expect(init(other, DEFAULT_CONFIG).created).not.toContain(".gitignore");
		const has = tmp();
		fs.writeFileSync(path.join(has, ".gitignore"), "/.worktrees\n");
		init(has, DEFAULT_CONFIG);
		expect(fs.readFileSync(path.join(has, ".gitignore"), "utf8")).toBe("/.worktrees\n");
	});

	it("leaves a repo that lints clean and can move a feature", () => {
		const root = fs.realpathSync(tmp());
		const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		git("init", "-q", "-b", "main");
		git("config", "user.email", "t@example.com");
		git("config", "user.name", "Test");
		git("config", "commit.gpgsign", "false");
		git("config", "core.hooksPath", path.join(root, ".no-hooks"));
		init(root, DEFAULT_CONFIG);
		fs.writeFileSync(path.join(root, "roadmap/1.ideas/demo.md"), "# Demo\n\n- [ ] one\n");
		git("add", "-A");
		git("commit", "-q", "-m", "init");
		expect(runLint(root, DEFAULT_CONFIG)).toEqual({ ok: true, problems: [] });
		moveFeature(root, DEFAULT_CONFIG, { slug: "demo", from: 1, to: 2 });
		expect(fs.existsSync(path.join(root, "roadmap/2.planning/demo.md"))).toBe(true);
	});
});
