// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { countTicks, groupFrom, loadBoard, phaseHeading, stageSlugs, titleFrom } from "../src/board.js";
import { DEFAULT_CONFIG, type GitBoardConfig } from "../src/config.js";
import type { Pipeline } from "../src/pipeline.js";

const config = (over: Partial<GitBoardConfig> = {}): GitBoardConfig => ({ ...DEFAULT_CONFIG, ...over });

function tree(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-board-"));
	for (const [rel, body] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), body);
	}
	return root;
}

function sh(cwd: string, ...args: string[]): string {
	return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
		cwd,
		encoding: "utf8",
	});
}

describe("stage-level files", () => {
	it("are not features, whatever their case", () => {
		const entries = ["README.md", "context.md", "AGENTS.md", "Claude.md", "real.md", "dir"].map((name) => ({ name, dir: name === "dir" }));
		expect(stageSlugs(entries)).toEqual(["dir", "real"]);
	});
});

describe("board loader", () => {
	it("joins a build list and its folder into one slug and skips stage readmes", () => {
		expect(
			stageSlugs([
				{ name: "README.md", dir: false },
				{ name: "cart-flow.md", dir: false },
				{ name: "cart-flow", dir: true },
				{ name: "spend-pace", dir: true },
				{ name: "notes.txt", dir: false },
				{ name: ".keep", dir: false },
			]),
		).toEqual(["cart-flow", "spend-pace"]);
	});

	it("reads the title from front matter before the first heading", () => {
		expect(titleFrom('---\ntitle: "Search router"\n---\n# Other')).toBe("Search router");
		expect(titleFrom("# Cart Flow (checkout section)\n\nBody")).toBe("Cart Flow (checkout section)");
		expect(titleFrom("No heading")).toBeNull();
	});

	it("reads front matter group", () => {
		expect(groupFrom("---\ngroup: Payments\n---\n# T")).toBe("Payments");
		expect(groupFrom('---\ngroup: "Core Web"\n---\n# T')).toBe("Core Web");
		expect(groupFrom("# T\ngroup: nope")).toBeNull();
	});

	it("counts ticked and open checkboxes", () => {
		const t = countTicks("- [x] one\n- [ ] **two**\n  - [X] three\n* [ ] four\n- not a box");
		expect(t).toEqual({ done: 2, total: 4, open: ["two", "four"] });
	});

	it("splits a phase heading into number and title", () => {
		expect(phaseHeading("# 01 Schema and access\n", "01-schema-and-access.md")).toEqual({ num: "01", title: "Schema and access" });
		expect(phaseHeading("# Phase 11b: Captcha\n", "11b-captcha.md")).toEqual({ num: "11b", title: "Captcha" });
		expect(phaseHeading("no heading", "03-cart-ui.md")).toEqual({ num: "03", title: "Cart ui" });
		expect(phaseHeading("", "04-live-read.md")).toEqual({ num: "04", title: "Live read" });
	});

	it("loads every stage from the config with the build list as the one tick source", () => {
		const root = tree({
			"roadmap/1.ideas/ad-builder/README.md": "# Ad Builder",
			"roadmap/3.open/cart-flow.md": "# Cart Flow\n- [x] a\n- [ ] b",
			"roadmap/3.open/cart-flow/README.md": "# Cart folder\n- [ ] ignored",
			"roadmap/3.open/cart-flow/01-prerequisites.md": "x",
			"roadmap/3.open/cart-flow/02-view-models.md": "x",
			"roadmap/4.in-progress/form-builder/README.md": "# Form builder",
			"roadmap/4.in-progress/form-builder/phases/checklist.md": "- [x] 01\n- [x] 02\n- [ ] 03",
			"roadmap/4.in-progress/form-builder/phases/01-schema.md": "x",
			"roadmap/5.complete/settings-build/notes.md": "no heading",
		});
		const board = loadBoard(root, config());
		expect(board.stages.map((s) => [s.id, s.folder, s.name])).toEqual([
			[1, "1.ideas", "Ideas"],
			[2, "2.planning", "Planning"],
			[3, "3.open", "Open"],
			[4, "4.in-progress", "In progress"],
			[5, "5.complete", "Complete"],
		]);
		expect(board).toMatchObject({ roadmapDir: "roadmap", mainBranch: "main", github: null, version: null });
		const { cards } = board;
		expect(cards.map((c) => c.id)).toEqual(["1:ad-builder", "3:cart-flow", "4:form-builder", "5:settings-build"]);
		const cart = cards.find((c) => c.slug === "cart-flow");
		expect(cart).toMatchObject({ title: "Cart Flow", done: 1, total: 2, open: ["b"], phases: 2, hasFolder: true, hasList: true });
		expect(cards.find((c) => c.slug === "form-builder")).toMatchObject({ done: 2, total: 3, phases: 1 });
		expect(cart?.phaseList.map((p) => [p.num, p.title, p.path])).toEqual([
			["01", "Prerequisites", "roadmap/3.open/cart-flow/01-prerequisites.md"],
			["02", "View models", "roadmap/3.open/cart-flow/02-view-models.md"],
		]);
		expect(cards.find((c) => c.slug === "form-builder")?.phaseList).toEqual([
			{ num: "01", title: "Schema", path: "roadmap/4.in-progress/form-builder/phases/01-schema.md", done: 0, total: 0 },
		]);
		expect(cards.find((c) => c.slug === "settings-build")?.title).toBe("Settings build");
		expect(cards.every((c) => c.createdAt !== null && c.landed === null)).toBe(true);
	});

	it("honours custom stages, lifecycle folder and groups", () => {
		const root = tree({
			"work/1.backlog/pay-links.md": "# Pay links",
			"work/1.backlog/misc-thing.md": "---\ngroup: Ops\n---\n# Misc",
			"work/2.doing/search-box.md": "# Search box",
			"work/3.shipped/old-thing.md": "# Old",
		});
		const cfg = config({
			roadmapDir: "work",
			stages: [
				{ folder: "1.backlog", name: "Backlog" },
				{ folder: "2.doing", name: "Doing" },
				{ folder: "3.shipped", name: "Shipped" },
			],
			groups: [{ name: "Payments", match: "^pay-", icon: "CreditCard" }],
			defaultGroup: "Other",
		});
		const board = loadBoard(root, cfg);
		expect(board.stages.map((s) => s.name)).toEqual(["Backlog", "Doing", "Shipped"]);
		expect(Object.fromEntries(board.cards.map((c) => [c.slug, c.group]))).toEqual({
			"misc-thing": "Ops",
			"pay-links": "Payments",
			"search-box": "Other",
			"old-thing": "Other",
		});
		expect(board.groups).toEqual(["Payments", "Other", "Ops"]);
		expect(board.groupIcons).toEqual({ Payments: "CreditCard" });
		expect(board.cards.map((c) => c.id)).toEqual(["1:misc-thing", "1:pay-links", "2:search-box", "3:old-thing"]);
	});

	it("reads landed, created and relations from git on the configured main branch", () => {
		const root = tree({ "roadmap/3.open/cart-flow.md": "# Cart Flow\nNeeds search-box first.\n", "roadmap/3.open/search-box.md": "# Search box" });
		sh(root, "init", "-q", "-b", "trunk");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "one");
		fs.mkdirSync(path.join(root, "roadmap/4.in-progress"), { recursive: true });
		sh(root, "mv", "roadmap/3.open/search-box.md", "roadmap/4.in-progress/search-box.md");
		sh(root, "commit", "-q", "-m", "two");
		const head = sh(root, "rev-parse", "--short", "HEAD").trim();

		const board = loadBoard(root, config({ mainBranch: "trunk" }));
		const box = board.cards.find((c) => c.slug === "search-box");
		const cart = board.cards.find((c) => c.slug === "cart-flow");
		expect(box?.stage).toBe(4);
		expect(box?.landed?.sha).toBe(head);
		expect(box?.touchedAt).toBe(box?.landed?.at);
		expect(box?.createdAt).not.toBeNull();
		expect(cart?.deps).toEqual(["4:search-box"]);
		expect(board.version).toMatch(/^[0-9a-f]{16}$/);

		// A main branch that does not exist reads no history rather than failing.
		const none = loadBoard(root, config({ mainBranch: "nope" }));
		expect(none.cards.every((c) => c.landed === null)).toBe(true);
		expect(none.version).toBeNull();
	});

	it("attaches the git pipeline and reports github state", () => {
		const root = tree({
			"roadmap/3.open/cart-flow.md": "# Cart Flow\nCode in `lib/cart/`.\n",
			"lib/cart/x.ts": "x",
		});
		sh(root, "init", "-q", "-b", "main");
		sh(root, "add", "-A");
		sh(root, "commit", "-q", "-m", "one");
		const pipeline: Pipeline = {
			readAt: 0,
			prs: null,
			branches: [{ branch: "w", path: root, wip: ["lib/cart/x.ts", "docs/other.md"], staged: [], committed: [], commits: 0, pr: null }],
		};
		const board = loadBoard(root, config(), { pipeline });
		expect(board.github).toBe(false);
		expect(board.cards[0]?.git.map((g) => [g.branch, g.wip, g.via])).toEqual([["w", 1, "code"]]);

		// A code root outside the list is ignored.
		const narrow = loadBoard(root, config({ codeRoots: ["app"] }), { pipeline });
		expect(narrow.cards[0]?.git).toEqual([]);
		expect(loadBoard(root, config(), { pipeline: { ...pipeline, prs: [] } }).github).toBe(true);
	});
});
