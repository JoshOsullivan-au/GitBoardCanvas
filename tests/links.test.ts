// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { isRewriteSkipped, mapPath, rewriteFile } from "../src/links.js";

const moves = [
	{ from: "roadmap/3.open/ad-board.md", to: "roadmap/4.in-progress/ad-board.md" },
	{ from: "roadmap/3.open/ad-board", to: "roadmap/4.in-progress/ad-board" },
];
const tokens = [{ from: "3.open/ad-board", to: "4.in-progress/ad-board" }];
const files = new Set([
	"roadmap/3.open/ad-board.md",
	"roadmap/3.open/ad-board",
	"roadmap/3.open/ad-board/README.md",
	"roadmap/3.open/daily-reporting.md",
	"roadmap/AGENTS.md",
	"docs/note.md",
]);
const exists = (p: string) => files.has(p);

describe("link rewrite", () => {
	it("maps files and folders through the moves", () => {
		expect(mapPath("roadmap/3.open/ad-board/README.md", moves)).toBe("roadmap/4.in-progress/ad-board/README.md");
		expect(mapPath("roadmap/3.open/ad-board-two.md", moves)).toBeNull();
	});

	it("rewrites a sibling's link into the moved folder", () => {
		const out = rewriteFile("roadmap/3.open/daily-reporting.md", "See [Ad Board](./ad-board/README.md#order).", moves, exists, tokens);
		expect(out).toBe("See [Ad Board](../4.in-progress/ad-board/README.md#order).");
	});

	it("keeps a moved file's links to its own folder and fixes its links out", () => {
		const text = "[folder](./ad-board/README.md) [daily](./daily-reporting.md) [agents](../AGENTS.md) [ext](https://x.dev/a.md)";
		const out = rewriteFile("roadmap/3.open/ad-board.md", text, moves, exists, tokens);
		expect(out).toBe(
			"[folder](./ad-board/README.md) [daily](../3.open/daily-reporting.md) [agents](../AGENTS.md) [ext](https://x.dev/a.md)",
		);
	});

	it("fixes links from inside the moved folder to the old stage", () => {
		const out = rewriteFile("roadmap/3.open/ad-board/README.md", "[list](../ad-board.md) [daily](../daily-reporting.md)", moves, exists, tokens);
		expect(out).toBe("[list](../ad-board.md) [daily](../../3.open/daily-reporting.md)");
	});

	it("rewrites bare mentions and repo links but not lookalike slugs", () => {
		const text = "Build `roadmap/3.open/ad-board/` and [it](../roadmap/3.open/ad-board.md); not 3.open/ad-board-two.";
		const out = rewriteFile("docs/note.md", text, moves, exists, tokens);
		expect(out).toBe("Build `roadmap/4.in-progress/ad-board/` and [it](../roadmap/4.in-progress/ad-board.md); not 3.open/ad-board-two.");
	});

	it("rewrites a link whose path holds parentheses, inside prose parentheses", () => {
		const withGroup = new Set([...files, "roadmap/3.open/ad-board/(drafts)/a.md"]);
		const text = "See ([draft](./ad-board/(drafts)/a.md)).";
		const out = rewriteFile("roadmap/3.open/daily-reporting.md", text, moves, (p) => withGroup.has(p), tokens);
		expect(out).toBe("See ([draft](../4.in-progress/ad-board/(drafts)/a.md)).");
	});

	it("leaves a broken link alone", () => {
		const text = "[gone](./missing.md)";
		expect(rewriteFile("roadmap/3.open/ad-board.md", text, moves, exists, tokens)).toBe(text);
	});

	it("skips configured prefixes", () => {
		expect(isRewriteSkipped("CHANGELOG/a.md", ["CHANGELOG/", "dist/"])).toBe(true);
		expect(isRewriteSkipped("docs/a.md", ["CHANGELOG/", "dist/"])).toBe(false);
	});

	it("replaces a stage/slug mention only when the slug ends there", () => {
		const text = "a 3.open/ad-board. b 3.open/ad-board/x c `3.open/ad-board` d 3.open/ad-board.md e 3.open/ad-board-two f 3.open/ad-board_v2 g 3.open/ad-boards";
		const out = rewriteFile("docs/note.md", text, moves, exists, tokens);
		expect(out).toBe("a 4.in-progress/ad-board. b 4.in-progress/ad-board/x c `4.in-progress/ad-board` d 4.in-progress/ad-board.md e 3.open/ad-board-two f 3.open/ad-board_v2 g 3.open/ad-boards");
	});
});
