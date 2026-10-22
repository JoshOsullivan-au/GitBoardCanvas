// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, type GitBoardConfig } from "../src/config.js";
import { attributeGit, codeMentions, parseStatus, type Pipeline, readPipeline, resolveCodeRoots } from "../src/pipeline.js";

const config = (over: Partial<GitBoardConfig> = {}): GitBoardConfig => ({ ...DEFAULT_CONFIG, github: false, ...over });

function sh(cwd: string, ...args: string[]): string {
	return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
		cwd,
		encoding: "utf8",
	});
}

function repo(files: Record<string, string>): string {
	const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-pipe-")));
	sh(root, "init", "-q", "-b", "main");
	for (const [rel, body] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), body);
	}
	sh(root, "add", "-A");
	sh(root, "commit", "-q", "-m", "init");
	return root;
}

describe("git pipeline", () => {
	it("splits porcelain status into staged and WIP, following renames", () => {
		const z = ["M  lib/a.ts", " M lib/b.ts", "MM lib/c.ts", "?? lib/new.ts", "R  lib/d2.ts", "lib/d.ts", "A  lib/e.ts", ""].join("\0");
		expect(parseStatus(z)).toEqual({
			staged: ["lib/a.ts", "lib/c.ts", "lib/d2.ts", "lib/e.ts"],
			wip: ["lib/b.ts", "lib/c.ts", "lib/new.ts"],
		});
	});

	it("keeps code paths a feature names and drops ones too many features share", () => {
		const f = (id: string, text: string) => ({ id, slug: id, stageFolder: "3.open", text });
		const m = codeMentions(
			[
				f("a", "Build `lib/cart/cartView.ts` and lib/cart/ (folder). See lib/utils.ts:12."),
				f("b", "lib/utils.ts"),
				f("c", "lib/utils.ts"),
				f("d", "lib/utils.ts"),
				f("e", "lib/utils.ts"),
			],
			["lib"],
			4,
		);
		expect([...m.keys()].sort()).toEqual(["lib/cart/", "lib/cart/cartView.ts"]);
	});

	it("only reads paths under the configured code roots", () => {
		const f = [{ id: "a", slug: "a", stageFolder: "1.x", text: "lib/one.ts and pkg/two.ts and src/three.ts" }];
		expect([...codeMentions(f, ["pkg", "src"]).keys()].sort()).toEqual(["pkg/two.ts", "src/three.ts"]);
		expect(codeMentions(f, []).size).toBe(0);
	});

	it("resolves auto code roots from tracked folders minus the lifecycle and dot folders", () => {
		const root = repo({
			"src/a.ts": "x",
			"lib/b.ts": "x",
			".github/w.yml": "x",
			"plan/1.ideas/one.md": "# one",
		});
		expect(resolveCodeRoots(root, config({ roadmapDir: "plan" })).sort()).toEqual(["lib", "src"]);
		expect(resolveCodeRoots(root, config({ codeRoots: ["pkg/", "src"] }))).toEqual(["pkg", "src"]);
	});

	it("ties branch work to features by lifecycle folder, branch name and named code", () => {
		const features = [
			{ id: "3:cart-flow", slug: "cart-flow", stageFolder: "3.open", text: "Code: `lib/cart/`." },
			{ id: "4:form-builder", slug: "form-builder", stageFolder: "4.in-progress", text: "" },
			{ id: "3:page-speed", slug: "page-speed", stageFolder: "3.open", text: "" },
		];
		const pipeline: Pipeline = {
			readAt: 0,
			prs: [],
			branches: [
				{
					branch: "worktree-x",
					path: "/x",
					wip: ["lib/cart/rank.ts"],
					staged: ["plan/4.in-progress/form-builder/phases/02-a.md"],
					committed: [],
					commits: 0,
					pr: null,
				},
				{
					branch: "page-speed",
					path: "/y",
					wip: [],
					staged: [],
					committed: ["app/layout.tsx", "next.config.ts"],
					commits: 2,
					pr: { number: 12, title: "Speed", url: "https://example.com/pull/12", draft: true, branch: "page-speed", files: [] },
				},
			],
		};
		const git = attributeGit(pipeline, features, { roadmapDir: "plan", codeRoots: ["lib", "app"] });
		expect(git.get("3:cart-flow")?.map((g) => [g.branch, g.wip, g.via])).toEqual([["worktree-x", 1, "code"]]);
		expect(git.get("4:form-builder")?.map((g) => [g.branch, g.staged, g.via])).toEqual([["worktree-x", 1, "roadmap"]]);
		expect(git.get("3:page-speed")).toEqual([
			{
				branch: "page-speed",
				wip: 0,
				staged: 0,
				committed: 2,
				commits: 2,
				pr: { number: 12, url: "https://example.com/pull/12", draft: true, title: "Speed" },
				files: { wip: [], staged: [], committed: ["app/layout.tsx", "next.config.ts"] },
				via: "branch",
			},
		]);
	});

	it("reads worktrees against the configured main branch, skips move branches, and leaves prs null without github", async () => {
		const root = repo({ "src/a.ts": "x" });
		sh(root, "branch", "trunk");
		sh(root, "checkout", "-q", "trunk");
		fs.writeFileSync(path.join(root, "src/b.ts"), "x");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "b");
		sh(root, "checkout", "-q", "main");
		const wt = path.join(root, ".worktrees", "feat");
		sh(root, "worktree", "add", "-q", "-b", "feat-one", wt, "main");
		fs.writeFileSync(path.join(wt, "new.ts"), "x");
		fs.writeFileSync(path.join(wt, "src/a.ts"), "changed");
		sh(wt, "add", "src/a.ts");
		const mv = path.join(root, ".worktrees", "mv");
		sh(root, "worktree", "add", "-q", "-b", "gitboard-move/x-1", mv, "main");

		const p = await readPipeline(root, config());
		expect(p.prs).toBeNull();
		expect(p.branches.map((b) => b.branch).sort()).toEqual(["feat-one", "main"]);
		const feat = p.branches.find((b) => b.branch === "feat-one");
		expect(feat).toMatchObject({ staged: ["src/a.ts"], wip: ["new.ts"], committed: [], commits: 0 });

		// "trunk" as the main branch: main itself is now unlanded work relative to nothing, feat-one is behind trunk.
		const t = await readPipeline(root, config({ mainBranch: "trunk" }));
		expect(t.branches.find((b) => b.branch === "main")).toMatchObject({ commits: 0 });
	});
});
