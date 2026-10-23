// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, type GitBoardConfig } from "../src/config.js";
import {
	attributeGit,
	codeMentions,
	parseStatus,
	type Pipeline,
	readPipeline,
	resolveCodeRoots,
	checksState,
	PR_STATUS_QUERY,
	parsePrStatus,
	reviewState,
	statusSettled,
} from "../src/pipeline.js";
import { type FakeGh, fakeGh, prRow } from "./fake-gh.js";

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
					pr: {
						number: 12,
						title: "Speed",
						url: "https://example.com/pull/12",
						draft: true,
						branch: "page-speed",
						files: [],
						checks: "fail",
						review: "required",
						conflicts: true,
					},
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
				pr: {
					number: 12,
					url: "https://example.com/pull/12",
					draft: true,
					title: "Speed",
					checks: "fail",
					review: "required",
					conflicts: true,
				},
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

describe("pull request status", () => {
	it("maps GitHub's rollup state, and null with no checks", () => {
		expect(checksState("SUCCESS")).toBe("pass");
		expect(checksState("FAILURE")).toBe("fail");
		expect(checksState("ERROR")).toBe("fail");
		expect(checksState("PENDING")).toBe("pending");
		expect(checksState("EXPECTED")).toBe("pending");
		expect(checksState(null)).toBeNull();
		expect(checksState("")).toBeNull();
		expect(checksState("constructor")).toBeNull();
	});

	it("maps the review decision", () => {
		expect(reviewState("APPROVED")).toBe("approved");
		expect(reviewState("CHANGES_REQUESTED")).toBe("changes");
		expect(reviewState("REVIEW_REQUIRED")).toBe("required");
		expect(reviewState("")).toBeNull();
		expect(reviewState(null)).toBeNull();
		expect(reviewState("constructor")).toBeNull();
	});

	it("parses the status query, skipping malformed nodes", () => {
		const node = (number: unknown, state: string | null, extra: Record<string, unknown> = {}) => ({
			number,
			commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] },
			...extra,
		});
		const json = JSON.stringify({
			data: {
				repository: {
					pullRequests: {
						nodes: [
							node(1, "FAILURE", { reviewDecision: "APPROVED", mergeable: "CONFLICTING" }),
							node(2, null, { reviewDecision: null, mergeable: "UNKNOWN" }),
							node("3", "SUCCESS"),
							null,
							{ number: 4 },
						],
					},
				},
			},
		});
		expect([...parsePrStatus(json)]).toEqual([
			[1, { checks: "fail", review: "approved", conflicts: true }],
			[2, { checks: null, review: null, conflicts: false }],
			[4, { checks: null, review: null, conflicts: false }],
		]);
		expect(parsePrStatus("{}").size).toBe(0);
		expect(parsePrStatus('{"errors":[{"message":"x"}]}').size).toBe(0);
	});

	let gh: FakeGh | null = null;
	afterEach(() => {
		gh?.restore();
		gh = null;
	});

	it("reads checks, review and conflicts through gh, for worktree branches and remote-only ones", async () => {
		gh = fakeGh();
		const root = repo({ "src/a.ts": "x" });
		sh(root, "worktree", "add", "-q", "-b", "feat-one", path.join(root, ".worktrees", "one"), "main");
		gh.prs([
			prRow({ number: 7, headRefName: "feat-one", checkState: "FAILURE", reviewDecision: "CHANGES_REQUESTED" }),
			prRow({ number: 8, headRefName: "remote-only", isDraft: true, checkState: "PENDING", reviewDecision: "REVIEW_REQUIRED", mergeable: "CONFLICTING", files: [{ path: "src/a.ts" }] }),
			prRow({ number: 9, headRefName: "green", checkState: "SUCCESS", reviewDecision: "APPROVED", mergeable: "UNKNOWN" }),
			prRow({ number: 10, headRefName: "no-checks" }),
		]);
		await readPipeline(root, config({ github: true }));
		await statusSettled(root);
		const p = await readPipeline(root, config({ github: true }));
		const list = gh.calls().find((a) => a[0] === "pr");
		const graphql = gh.calls().find((a) => a[0] === "api");
		expect(list?.slice(0, 2)).toEqual(["pr", "list"]);
		expect(list?.[list.indexOf("--json") + 1]).toBe("number,title,url,isDraft,headRefName,files");
		expect(graphql?.slice(0, 2)).toEqual(["api", "graphql"]);
		expect(graphql).toContain(`query=${PR_STATUS_QUERY}`);
		expect(PR_STATUS_QUERY).toContain("reviewDecision mergeable");
		// `contexts` makes GitHub roll up every check; a large page of them is what timed out.
		expect(PR_STATUS_QUERY).toContain("statusCheckRollup { state contexts(first: 1) { totalCount } }");
		expect(PR_STATUS_QUERY).not.toMatch(/contexts\(first: \d{2,}/);
		// SECURITY.md: gh only reads. The status call is a query, never a mutation.
		expect(PR_STATUS_QUERY.startsWith("query(")).toBe(true);
		expect(PR_STATUS_QUERY).not.toMatch(/mutation/i);
		for (const call of gh.calls()) expect(["pr list", "api graphql"]).toContain(call.slice(0, 2).join(" "));
		const pr = (branch: string) => p.branches.find((b) => b.branch === branch)?.pr;
		expect(pr("feat-one")).toMatchObject({ number: 7, checks: "fail", review: "changes", conflicts: false, draft: false });
		expect(pr("remote-only")).toMatchObject({ number: 8, checks: "pending", review: "required", conflicts: true, draft: true });
		expect(p.branches.find((b) => b.branch === "remote-only")).toMatchObject({ path: null, committed: ["src/a.ts"] });
		expect(pr("green")).toMatchObject({ number: 9, checks: "pass", review: "approved", conflicts: false });
		expect(pr("no-checks")).toMatchObject({ number: 10, checks: null, review: null, conflicts: false });
	});

	it("keeps the pull requests without status when only the status call fails", async () => {
		gh = fakeGh();
		gh.fail("status");
		gh.prs([prRow({ number: 3, headRefName: "x", checkState: "FAILURE", mergeable: "CONFLICTING" })]);
		const root = repo({ "a.md": "x" });
		await readPipeline(root, config({ github: true }));
		await statusSettled(root);
		const p = await readPipeline(root, config({ github: true }));
		expect(p.prs).toEqual([expect.objectContaining({ number: 3, checks: null, review: null, conflicts: false })]);
	});

	it("never waits on a slow status read: the list shows at once and the status joins on a later read", async () => {
		gh = fakeGh();
		gh.statusDelay(4_000);
		gh.prs([prRow({ number: 6, headRefName: "x", checkState: "FAILURE" })]);
		const root = repo({ "a.md": "x" });
		const t = Date.now();
		const first = await readPipeline(root, config({ github: true }));
		expect(Date.now() - t).toBeLessThan(3_000);
		expect(first.prs).toEqual([expect.objectContaining({ number: 6, checks: null })]);
		await statusSettled(root);
		const later = await readPipeline(root, config({ github: true }));
		expect(later.prs).toEqual([expect.objectContaining({ number: 6, checks: "fail" })]);
		// One list call and one status call: the second read used both caches.
		expect(gh.calls().map((c) => c.slice(0, 2).join(" ")).sort()).toEqual(["api graphql", "pr list"]);
	});

	it("leaves prs null when gh fails, and never calls gh with github off", async () => {
		gh = fakeGh();
		gh.fail(true);
		const failingRoot = repo({ "a.md": "x" });
		const failing = await readPipeline(failingRoot, config({ github: true }));
		expect(failing.prs).toBeNull();
		await statusSettled(failingRoot);
		const calls = gh.calls().length;
		expect(calls).toBeGreaterThan(0);
		gh.fail(false);
		gh.prs([prRow()]);
		const off = await readPipeline(repo({ "a.md": "x" }), config({ github: false }));
		expect(off.prs).toBeNull();
		expect(gh.calls()).toHaveLength(calls);
	});
});
