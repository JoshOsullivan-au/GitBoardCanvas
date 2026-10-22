// SPDX-License-Identifier: MIT
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, type GitBoardConfig } from "../src/config.js";
import { runLint } from "../src/lint.js";

let root: string;
const write = (rel: string, body = "x\n") => {
	fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
	fs.writeFileSync(path.join(root, rel), body);
};
const config = (over: Partial<GitBoardConfig["lint"]> = {}): GitBoardConfig => ({
	...DEFAULT_CONFIG,
	lint: { ...DEFAULT_CONFIG.lint, ...over },
});

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-lint-"));
	for (const s of DEFAULT_CONFIG.stages) fs.mkdirSync(path.join(root, "roadmap", s.folder), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("runLint", () => {
	it("passes a clean tree", () => {
		write("roadmap/3.open/a.md", "# A\n[b](./b.md)\n");
		write("roadmap/3.open/b.md");
		write("roadmap/3.open/a/phases/01-x.md");
		write("roadmap/3.open/a/phases/11b-y.md");
		expect(runLint(root, config())).toEqual({ ok: true, problems: [] });
	});

	it("L1: a missing stage folder", () => {
		fs.rmSync(path.join(root, "roadmap/2.planning"), { recursive: true });
		expect(runLint(root, config()).problems).toEqual(["L1: stage folder roadmap/2.planning is missing"]);
	});

	it("L2: a slug in two stages (stage-level README is not a feature)", () => {
		write("roadmap/1.ideas/README.md");
		write("roadmap/2.planning/README.md");
		write("roadmap/1.ideas/a.md");
		write("roadmap/3.open/a/README.md");
		expect(runLint(root, config()).problems).toEqual(["L2: a sits in 1.ideas and 3.open"]);
	});

	it("L3: a broken relative link, ignoring externals, anchors and code fences", () => {
		write("roadmap/3.open/a.md", "[x](./gone.md) [e](https://x.dev) [h](#top)\n```\n[c](./nope.md)\n```\n");
		expect(runLint(root, config()).problems).toEqual(["L3: roadmap/3.open/a.md links to missing ./gone.md"]);
	});

	it("L4: phase file naming", () => {
		write("roadmap/3.open/a/phases/1-x.md");
		write("roadmap/3.open/a/phases/notes.md");
		write("roadmap/3.open/a/phases/checklist.md");
		write("roadmap/3.open/a/phases/02b-ok.md");
		const { problems } = runLint(root, config());
		expect(problems).toHaveLength(2);
		expect(problems.every((p) => p.startsWith("L4:"))).toBe(true);
	});

	it("L5: required phase headings and README sections", () => {
		write("roadmap/3.open/a/phases/01-x.md", "## Goal\n");
		write("roadmap/3.open/a/README.md", "## Order\n");
		const { problems } = runLint(root, config({ phaseHeadings: ["Goal", "## Done when"], readmeSections: ["Order", "Status"] }));
		expect(problems).toEqual([
			"L5: roadmap/3.open/a/phases/01-x.md lacks ## Done when",
			"L5: roadmap/3.open/a/README.md lacks ## Status",
		]);
	});

	it("skips <roadmapDir>/templates/ in every check", () => {
		write("roadmap/templates/feature/FEATURE.md", "[plan](./feature-slug/README.md)\n");
		write("roadmap/templates/feature/phases/bad name.md", "x\n");
		expect(runLint(root, config()).ok).toBe(true);
	});

	it("reports slugs outside letters, digits, - and _ as L6", () => {
		write("roadmap/3.open/has space.md");
		write("roadmap/3.open/a.b/README.md");
		write("roadmap/3.open/fine_one-2.md");
		const { problems } = runLint(root, config());
		expect(problems.filter((p) => p.startsWith("L6:"))).toHaveLength(2);
		expect(problems.join("\n")).toMatch(/has space/);
	});

	it("ignores README, CONTEXT, AGENTS and CLAUDE at stage level in any case", () => {
		for (const n of ["README.md", "context.md", "AGENTS.md", "Claude.md"]) write(`roadmap/3.open/${n}`);
		write("roadmap/4.in-progress/CONTEXT.md");
		expect(runLint(root, config()).ok).toBe(true);
	});
});
