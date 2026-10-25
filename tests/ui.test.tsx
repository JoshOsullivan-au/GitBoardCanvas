// SPDX-License-Identifier: MIT
// The board page (src/web): React renders it, so these test the parts directly and read the source and styles for
// the rules that hold across files.
import fs from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { prStates, prWorst } from "../src/web/lib/git";
import { secondOf } from "../src/web/components/shell/AppSidebar";
import { hashOf, parseHash } from "../src/web/lib/hash";
import { resolveRel } from "../src/web/lib/markdown";
import { NEED_FILTER, navOf, placeFilters } from "../src/web/lib/nav";
import { Card } from "../src/web/roadmap/Card";
import { buildModel, emptyFilters, filterOptions } from "../src/web/roadmap/model";
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
		expect(read("lib/markdown.tsx")).toContain("dangerouslySetInnerHTML={{ __html: html }}");
		expect(read("roadmap/Details.tsx")).toContain("<Markdown html={view.html}");
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

	it("opens on the Roadmap by default, or on the view a viewer last chose, and shows Architecture only when configured", () => {
		const app = read("App.tsx");
		expect(app).toContain('loadText("gitboard-tab") === "architecture" ? "architecture" : "roadmap"');
		expect(app).toContain('const view: ViewName = arch ? route.view : "roadmap";');
		expect(read("components/shell/AppSidebar.tsx")).toMatch(/\{arch \? \(\s*<Place\s+href=\{hashOf\(\{ view: "architecture" \}\)\}/);
	});

	it("routes links through one shared router", () => {
		expect(source.match(/const channel = /g)).toHaveLength(1);
		expect(read("roadmap/Roadmap.tsx")).toContain("drawRoutes(cols, links)");
		expect(read("architecture/Architecture.tsx")).toContain("drawRoutes(");
	});

	it("turns the sticky column headers more opaque once a board scrolls", () => {
		expect(css).toContain(".scroll[data-scrolled] .fwsh.lg { --lg-base: color-mix(in oklab, var(--background) 88%, transparent); }");
		const app = read("App.tsx");
		expect(app).toContain('e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollTop > 0)');
		expect(app.match(/onScroll=\{markScrolled\}/g)).toHaveLength(2);
	});

	it("keeps the approved fixed columns", () => {
		expect(css).toContain(".arch .fwcols { grid-template-columns: 216px 292px 292px 292px; column-gap: 88px;");
	});

	it("lets Tailwind scan only the shadcn parts, so board class names never become utilities", () => {
		expect(read("styles/index.css")).toMatch(/@import "tailwindcss" source\(none\);[\s\S]*@source "\.\.\/components";/);
	});
});

describe("shell", () => {
	it("puts Work in flight and Needs you under Roadmap, each opening a second bar while the main one shrinks", () => {
		const bar = read("components/shell/AppSidebar.tsx");
		const order = [...bar.matchAll(/<(Place|Opener)\s+(?:href=\{[^}]+\}\)?\}\s+)?(?:second="\w+"\s+)?icon="\w+"\s+label="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
		expect(order).toEqual(["Opener Work in flight", "Opener Needs you", "Place Roadmap", "Place Architecture"]);
		expect(bar).toMatch(/onPick=\{\(\) => onPick\("roadmap"\)\}\s*>\s*\{icons \? null : openers\}\s*<\/Place>/);
		expect(secondOf(parseHash("#/roadmap?branch=x")!)).toBe("flight");
		expect(secondOf(parseHash("#/roadmap?need=gated")!)).toBe("needs");
		expect(secondOf(parseHash("#/roadmap?stage=2")!)).toBeNull();
		const app = read("App.tsx");
		expect(app).toMatch(/const onSecond = \(s: Second \| null\) => \{\s*setSecond\(s\);\s*if \(s\) setOpen\(false\);/);
		expect(app).toMatch(/const onOpenChange = \(o: boolean\) => \{\s*setOpen\(o\);\s*if \(o\) setSecond\(null\);/);
		expect(app).toContain("setOpen(picked.current || second ? false : sidebarOpen(view));");
		// A row picked in the second bar closes it and keeps the main bar shrunk; the arrival rule does not reopen it.
		expect(app).toMatch(/const onRow = \(s: Second, feature\?: string\) => \{[^}]*\}\)\);\s*setSecond\(null\);\s*setOpen\(false\);\s*if \(s !== placeSecond\) rowPicked\.current = true;/);
		expect(bar).toContain('onPick={() => onRow("flight", b.lead)}');
		// A branch also opens its lead feature's details panel, once per pick.
		expect(app).toContain("if (feature) setShow((prev) => ({ id: feature, n: (prev?.n ?? 0) + 1 }));");
		expect(read("roadmap/Roadmap.tsx")).toMatch(/if \(show && model\?\.byId\.has\(show\.id\)\) openDetails\(show\.id\);[\s\S]*?\}, \[show\?\.n\]\);/);
		expect(bar).toContain('onPick={() => onRow("needs")}');
	});

	it("names every place with a hash, and reads only the places it names", () => {
		for (const h of ["#/roadmap", "#/roadmap?stage=2", "#/roadmap?branch=feat%2Fa%20b", "#/roadmap?need=blocked", "#/architecture"]) {
			expect(hashOf(parseHash(h)!)).toBe(h);
		}
		expect(parseHash("#/roadmap?branch=feat%2Fa%20b")?.branch).toBe("feat/a b");
		expect(parseHash("#/roadmap?need=everything")?.need).toBeNull();
		expect(parseHash("#/roadmap?stage=-1")?.stage).toBeNull();
		for (const h of ["", "#", "#/", "#/settings", "#roadmap"]) expect(parseHash(h)).toBeNull();
		// One place at a time, in the order hashOf writes them.
		expect(parseHash("#/roadmap?stage=2&need=blocked&branch=x")).toMatchObject({ stage: 2, branch: null, need: null });
		expect(parseHash("#/roadmap?need=blocked&branch=x")).toMatchObject({ branch: "x", need: null });
	});

	it("shows only a Needs you place's filter while there, and gives the person's own filters back on leaving", () => {
		const own = emptyFilters();
		own.state.add("linked");
		own.group.add("Core");
		const blocked = placeFilters("blocked", own, null);
		expect(blocked.own).toBe(own);
		expect([...blocked.shown.state]).toEqual(["blocked"]);
		expect(blocked.shown.group.size).toBe(0);
		// Place to place keeps the filters set aside first, not the previous place's.
		const failing = placeFilters("failing", blocked.shown, blocked.own);
		expect(failing.own).toBe(own);
		expect([...failing.shown.git]).toEqual(["failing"]);
		expect(placeFilters(null, failing.shown, failing.own)).toEqual({ shown: own, own: null });
		// Any other place leaves the filters as they are.
		const same = emptyFilters();
		expect(placeFilters(null, same, null).shown).toBe(same);
		// The Roadmap saves the person's filters, never a place's, and a change they make there is theirs.
		const roadmap = read("roadmap/Roadmap.tsx");
		expect(roadmap).toContain("next.filters ?? ownFilters.current ?? filters");
		expect(roadmap).toMatch(/const ownChange = \(next: Filters\) => \{\s*ownFilters\.current = null;/);
	});

	it("keeps the place when the skip link moves focus to the board", () => {
		expect(read("App.tsx")).toMatch(/className="skip"[\s\S]*?e\.preventDefault\(\);\s*document\.getElementById\("content"\)\?\.focus\(\);/);
		expect(read("lib/hash.ts")).toContain('if (location.hash.length > 1 && !location.hash.startsWith("#/")) return;');
	});

	it("counts per stage and per branch, and shows a Needs you item only when it has features, matching its filter", () => {
		const git = (branch: string, wip: number, pr: Partial<NonNullable<CardData["git"][number]["pr"]>> | null = null) => ({
			branch,
			wip,
			staged: 0,
			committed: 1,
			commits: 1,
			files: { wip: [], staged: [], committed: [] },
			via: "branch" as const,
			pr: pr && { number: 7, url: "", title: "", draft: false, checks: null, review: null, conflicts: false, ...pr },
		});
		const cards = [
			card({ id: "1:a", slug: "a", git: [git("feat-x", 2, { checks: "fail" })], decisions: ["?"] }),
			card({ id: "1:b", slug: "b", git: [git("feat-x", 1, { checks: "fail" }), git("feat-y", 0)], deps: ["1:a"] }),
			card({ id: "2:c", slug: "c", stage: 2 }),
		];
		const m = buildModel(board(cards));
		const nav = navOf(m);
		expect(nav.stages.map((s) => s.count)).toEqual([2, 1]);
		expect(nav.branches).toMatchObject([
			// a has 3 files on feat-x and b has 2, so a leads.
			{ branch: "feat-x", files: 5, features: 2, lead: "1:a", pr: { number: 7, worst: { text: "Checks failing" } } },
			{ branch: "feat-y", files: 1, features: 1, lead: "1:b", pr: null },
		]);
		const opts = filterOptions(m);
		for (const n of nav.needs) {
			const [g, v] = NEED_FILTER[n.need];
			expect(m.cards.filter(opts[g].find(([value]) => value === v)![3]).length, n.need).toBe(n.count);
		}
		expect(nav.needs.map((n) => n.need)).toEqual(["blocked", "gated", "failing"]);
		// a is gated and failing, b is blocked and failing: two features, though three items count them.
		expect(nav.attention).toBe(2);
		expect(navOf(buildModel({ ...board(cards), github: false })).needs.map((n) => n.need)).toEqual(["blocked", "gated"]);
		expect(navOf(buildModel(board([card()]))).needs).toEqual([]);
	});

	it("opens the sidebar expanded on the Roadmap and as icons on Architecture, then keeps each view's own toggle", () => {
		const app = read("App.tsx");
		expect(app).toContain('{ roadmap: "gitboard-sidebar-roadmap", architecture: "gitboard-sidebar-architecture" }');
		expect(app).toContain('return saved ? saved === "expanded" : v === "roadmap";');
		expect(read("components/ui/sidebar.tsx")).not.toContain("document.cookie");
	});

	it("folds the sidebar when Roadmap or Architecture is picked, without changing what each view remembers", () => {
		const app = read("App.tsx");
		expect(app).toMatch(/const onPick = \(to: ViewName\) => \{\s*setSecond\(null\);\s*if \(to === view\) setOpen\(false\);\s*else picked\.current = true;/);
		const bar = read("components/shell/AppSidebar.tsx");
		expect(bar).toContain('onPick={() => onPick("roadmap")}');
		expect(bar).toContain('onPick={() => onPick("architecture")}');
	});

	it("keeps its own class names apart from the board's, so no board card picks up shell layout", () => {
		// .shell is the map's shell endpoint card; no rule may select it on its own.
		expect(css).not.toMatch(/(^|,)\s*\.shell[\s{,:]/m);
		expect(read("App.tsx")).toContain('className="app-shell"');
		expect(css).toContain(".app-shell .arch .fwcols { column-gap: 64px; }");
	});

	it("resolves doc links against the open doc's folder", () => {
		expect(resolveRel("docs/spec.md", "../CHANGELOG.md")).toBe("CHANGELOG.md");
		expect(resolveRel("roadmap/README.md", "./1.ideas/")).toBe("roadmap/1.ideas/README.md");
		expect(resolveRel("roadmap/3.open/a.md", "b.md#top")).toBe("roadmap/3.open/b.md");
	});
});
