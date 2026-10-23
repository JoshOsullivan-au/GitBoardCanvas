// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const html = fs.readFileSync(path.resolve(import.meta.dirname, "../src/ui/board.html"), "utf8");

describe("board page", () => {
	it("escapes group and stage names wherever they enter markup", () => {
		const unescaped = ['class="gn">${group}', ", ${stage.name}\"", "${s.id} ${s.name}\"", "</span>${s.name}</div>", "${p.from.name}", "${p.to.name}", "${c.group}</div>"];
		for (const raw of unescaped) expect(html, raw).not.toContain(raw);
	});

	it("escapes quotes as well as angle brackets", () => {
		expect(html).toContain('"\'": "&#39;"');
	});
});

describe("pull request status", () => {
	type State = { k: string; text: string; chip?: string; attn?: boolean };
	type Pr = { draft: boolean; checks: string | null; review: string | null; conflicts: boolean };
	const start = html.indexOf("/* ---- pull request status");
	const block = html.slice(start, html.indexOf("function gitSummary", start));
	const { prStates, prWorst } = new Function(`${block}; return { prStates, prWorst };`)() as {
		prStates: (p: Pr) => State[];
		prWorst: (prs: Pr[]) => State | null;
	};
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
		expect(html).toContain('["failing", "Checks failing", "Warning", (c) => gitSummary(c).prs.some((p) => p.checks === "fail")]');
		expect(html).toContain('["review", "Needs review", "UserCircle", (c) => gitSummary(c).prs.some((p) => p.review === "required" && !p.draft)]');
		expect(html).toContain(".gs-attn { --gs: var(--tone-att); }");
	});

	it("keeps the git chip whole on a narrow card, dropping the date chip instead of pushing it off the card", () => {
		expect(html).toContain(".card .chips.fit { left: 10px; height: 16px; overflow: hidden; flex-flow: row-reverse wrap; }");
		expect(html).toContain(".card .chips.fit .dt { order: 1; }");
		expect(html).toContain('<span class="chips fit">${c.createdAt ?');
	});
});

describe("architecture tab", () => {
	const icons = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../src/ui/icons.json"), "utf8")) as Record<string, unknown>;

	it("ships every icon the page names", () => {
		const named = [...html.matchAll(/icon\("(\w+)"\)|data-icon="(\w+)"|ICON = \{([^}]*)\}/g)].flatMap((m) =>
			m[3] !== undefined ? [...m[3].matchAll(/"(\w+)"/g)].map((x) => x[1]) : [m[1] ?? m[2]],
		);
		const used = ["Timer", "Plug", "Globe", "Cloud", "ShieldCheck", "Stack", "Lightning", "Database", "Check", "CaretLeft", "CaretRight", "X"];
		for (const name of new Set([...named, ...used])) expect(Object.keys(icons), name).toContain(name);
	});

	it("puts the tabs in the header as pills, Roadmap first and the default, remembered per viewer", () => {
		const tabs = html.slice(html.indexOf('class="tabs"'), html.indexOf("</div>", html.indexOf('class="tabs"')));
		expect(tabs.indexOf('data-tab="roadmap"')).toBeGreaterThan(-1);
		expect(tabs.indexOf('data-tab="roadmap"')).toBeLessThan(tabs.indexOf('data-tab="architecture"'));
		expect(tabs).toMatch(/class="opt" role="tab"[^>]*aria-selected="true"[^>]*data-tab="roadmap"/);
		expect(html).toContain('localStorage.getItem("gitboard-tab")');
		expect(html).toMatch(/if \(!ARCHITECTURE\)/);
	});

	it("routes links through one shared router", () => {
		expect(html.match(/const channel = /g)).toHaveLength(1);
		expect(html.match(/drawRoutes\(/g)?.length).toBeGreaterThanOrEqual(3);
	});

	it("keeps the approved fixed columns", () => {
		expect(html).toContain(".arch .fwcols { grid-template-columns: 216px 292px 292px 292px; column-gap: 88px;");
	});

	it("escapes route and endpoint names", () => {
		for (const raw of ["<b>${n.label}", "<b>${epLabel(", "${epKind(", "${e.endpoint}</", "class=\"gn\">${name}"]) expect(html, raw).not.toContain(raw);
	});
});
