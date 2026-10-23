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
