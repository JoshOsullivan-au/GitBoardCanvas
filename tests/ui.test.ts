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
