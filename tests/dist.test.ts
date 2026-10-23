// SPDX-License-Identifier: MIT
// The CLI tests run `dist/cli.js`, as installed users do. This fails when `src/` changed after the last build, so a test
// run never passes against a stale build.
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repo = path.resolve(import.meta.dirname, "..");

function newest(dir: string): { file: string; at: number } {
	let best = { file: "", at: 0 };
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		const next = e.isDirectory() ? newest(p) : { file: p, at: fs.statSync(p).mtimeMs };
		if (next.at > best.at) best = next;
	}
	return best;
}

describe("built CLI", () => {
	it("is newer than every file in src/", () => {
		const built = path.join(repo, "dist", "cli.js");
		expect(fs.existsSync(built), "run npm run build").toBe(true);
		const source = newest(path.join(repo, "src"));
		expect(fs.statSync(built).mtimeMs, `${path.relative(repo, source.file)} changed after the last build: run npm run build`).toBeGreaterThanOrEqual(
			source.at,
		);
	});
});
