// SPDX-License-Identifier: MIT
// The board page (src/web): React renders it, so these test the parts directly and read the source and styles for
// the rules that hold across files.
import fs from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { prStates, prWorst } from "../src/web/lib/git";
import { Card } from "../src/web/roadmap/Card";
import { buildModel, filterOptions } from "../src/web/roadmap/model";
import type { Board, Card as CardData } from "../src/types.js";

const web = path.resolve(import.meta.dirname, "../src/web");
const read = (rel: string) => fs.readFileSync(path.join(web, rel), "utf8");
const sources = (dir = web): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) ? [p] : [];
	});
const source = sources()
	.map((f) => fs.readFileSync(f, "utf8"))
	.join("\n");
const css = read("styles/board.css");
const icons = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../src/ui/icons.json"), "utf8")) as Record<string, unknown>;
(globalThis as { GITBOARD?: unknown }).GITBOARD = { icons, architecture: false };

const card = (over: Partial<CardData> = {}): CardData => ({
	id: "1:a",
	slug: "a",
	stage: 1,
	title: "A",
	group: "Core",
	done: 0,
	total: 0,
	open: [],
	phases: 0,
	phaseList: [],
	hasFolder: false,
	hasList: true,
	touchedAt: null,
	createdAt: null,
	landed: null,
	git: [],
	decisions: [],
	ops: [],
	deps: [],
	links: [],
	...over,
});
const board = (cards: CardData[]): Board => ({
	cards,
	stages: [
		{ id: 1, folder: "1.ideas", name: "Ideas" },
		{ id: 2, folder: "2.done", name: "Complete" },
	],
	groups: ["Core"],
	groupIcons: {},
	roadmapDir: "roadmap",
	mainBranch: "main",
	readAt: 0,
	version: null,
	github: true,
});

describe("board page", () => {
	it("escapes titles and group names in markup", () => {
		const m = buildModel(board([card({ title: `<img src=x onerror="alert(1)">`, group: `"><b>g</b>` })]));
		const html = renderToStaticMarkup(<Card m={m} c={m.cards[0]} trace={null} grabbed={false} dragging={false} />);
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<b>g</b>");
		expect(html).toContain("&lt;img");
	});

	it("sets HTML only from the server's rendered markdown, whose raw HTML the server escapes", () => {
		expect(source.match(/dangerouslySetInnerHTML/g)).toHaveLength(1);
		expect(read("roadmap/Details.tsx")).toContain("dangerouslySetInnerHTML={{ __html: view.html }}");
	});
});

describe("pull request status", () => {
	type Pr = { draft: boolean; checks: "pass" | "fail" | "pending" | null; review: "approved" | "changes" | "required" | null; conflicts: boolean };
	const pr = (over: Partial<Pr> = {}): Pr => ({ draft: false, checks: null, review: null, conflicts: false, ...over });

	it("puts the worst state on the chip: conflicts, failing, changes, pending, review, passing", () => {
		const all = pr({ conflicts: true, checks: "fail", review: "changes" });
		expect(prWorst([all])).toMatchObject({ text: "Conflicts", attn: true });
		expect(prWorst([pr({ checks: "fail", review: "changes" })])).toMatchObject({ text: "Checks failing", chip: "Failing", attn: true });
		expect(prWorst([pr({ checks: "pending", review: "changes" })])).toMatchObject({ text: "Changes requested" });
		expect(prWorst([pr({ checks: "pending", review: "required" })])).toMatchObject({ text: "Checks pending" });
		expect(prWorst([pr({ checks: "pass", review: "required" })])).toMatchObject({ text: "Review required" });
		expect(prWorst([pr({ checks: "pass", review: "approved" })])).toMatchObject({ text: "Checks passing" });
		expect(prWorst([pr({ checks: "pass" }), pr({ checks: "fail" })])).toMatchObject({ text: "Checks failing" });
		expect(prWorst([pr()])).toBeNull();
		expect(prWorst([])).toBeNull();
		for (const s of [prWorst([pr({ checks: "pending" })]), prWorst([pr({ review: "changes" })])]) expect(s?.attn).toBeFalsy();
	});

	it("lists each state in the details, and a draft does not ask for review", () => {
		expect(prStates(pr({ conflicts: true, checks: "fail", review: "approved", draft: true })).map((s) => s.text)).toEqual([
			"Conflicts",
			"Checks failing",
			"Approved",
			"Draft",
		]);
		expect(prStates(pr({ review: "required", draft: true })).map((s) => s.text)).toEqual(["Draft"]);
		expect(prStates(pr({ review: "required" })).map((s) => s.text)).toEqual(["Review required"]);
		expect(prStates(pr()).map((s) => s.text)).toEqual([]);
	});

	it("offers the Checks failing and Needs review filters, and marks attention states with the attention tone", () => {
		const prCard = (checks: Pr["checks"], review: Pr["review"], draft = false) =>
			card({
				id: `1:${checks}${review}${draft}`,
				git: [{ branch: "b", wip: 0, staged: 0, committed: 0, commits: 0, files: { wip: [], staged: [], committed: [] }, via: "branch", pr: { number: 1, url: "", title: "", conflicts: false, draft, checks, review } }],
			});
		const m = buildModel(board([prCard("fail", null), prCard("pass", "required"), prCard("pass", "required", true)]));
		const git = filterOptions(m).git;
		const test = (v: string) => git.find(([value]) => value === v)![3];
		expect(m.cards.filter(test("failing")).map((c) => c.id)).toEqual(["1:failnullfalse"]);
		expect(m.cards.filter(test("review")).map((c) => c.id)).toEqual(["1:passrequiredfalse"]);
		expect(css).toContain(".gs-attn { --gs: var(--tone-att); }");
	});

	it("keeps the git chip whole on a narrow card, dropping the date chip instead of pushing it off the card", () => {
		expect(css).toContain(".card .chips.fit { left: 10px; height: 16px; overflow: hidden; flex-flow: row-reverse wrap; }");
		expect(css).toContain(".card .chips.fit .dt { order: 1; }");
		const m = buildModel(board([card({ createdAt: Date.UTC(2026, 9, 1) })]));
		const html = renderToStaticMarkup(<Card m={m} c={m.cards[0]} trace={null} grabbed={false} dragging={false} />);
		expect(html).toMatch(/^<div class="card[^"]*"[^>]*><span class="chips fit"><span class="av-b dt"/);
	});
});

describe("architecture tab", () => {
	it("ships every icon the page names", () => {
		const named = [...source.matchAll(/(?:<Icon name=|icon=|icon: |mark: |iconSvg\(.*?)"([A-Z]\w+)"/g)].map((m) => m[1]);
		const fixed = [...source.matchAll(/KIND_ICON[^=]*= \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]));
		const used = ["Timer", "Plug", "Globe", "Cloud", "ShieldCheck", "Stack", "Lightning", "Database", "Check", "CaretLeft", "CaretRight", "X", "CheckSquare", "Square"];
		expect(named.length).toBeGreaterThan(40);
		for (const name of new Set([...named, ...fixed, ...used])) expect(Object.keys(icons), name).toContain(name);
	});

	it("puts the tabs in the header as pills, Roadmap first and the default, remembered per viewer", () => {
		const app = read("App.tsx");
		expect(app).toContain('(["roadmap", "architecture"] as const)');
		expect(app).toContain('loadText("gitboard-tab") === "architecture" ? "architecture" : "roadmap"');
		expect(app).toMatch(/const arch = architectureOn\(\);[\s\S]*\{arch \? \(\s*<div className="tabs" role="tablist"/);
	});

	it("routes links through one shared router", () => {
		expect(source.match(/const channel = /g)).toHaveLength(1);
		expect(read("roadmap/Roadmap.tsx")).toContain("drawRoutes(cols, links)");
		expect(read("architecture/Architecture.tsx")).toContain("drawRoutes(");
	});

	it("keeps the approved fixed columns", () => {
		expect(css).toContain(".arch .fwcols { grid-template-columns: 216px 292px 292px 292px; column-gap: 88px;");
	});

	it("lets Tailwind scan only the shadcn parts, so board class names never become utilities", () => {
		expect(read("styles/index.css")).toMatch(/@import "tailwindcss" source\(none\);[\s\S]*@source "\.\.\/components";/);
	});
});
