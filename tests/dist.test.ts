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

/** Class names in Tailwind's utilities layer of the built page. */
function utilities(html: string): Set<string> {
	const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
	const start = css.indexOf("@layer utilities{");
	let depth = 0;
	let end = start;
	for (let i = start; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}" && --depth === 0) {
			end = i;
			break;
		}
	}
	return new Set([...css.slice(start, end).matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\(.)/g, "$1")));
}

describe("built page", () => {
	// The board's class names live outside Tailwind's scan, but a shadcn part can still make one a utility: the
	// Sidebar's `fixed` once gave the read path's unlinked rows position: fixed.
	it("has no board class name that Tailwind also makes a utility", () => {
		const html = fs.readFileSync(path.join(repo, "dist", "ui", "board.html"), "utf8");
		const tw = utilities(html);
		expect(tw.size, "no utilities layer found").toBeGreaterThan(50);
		const web = path.join(repo, "src", "web");
		const board = new Set<string>();
		for (const m of fs.readFileSync(path.join(web, "styles", "board.css"), "utf8").matchAll(/\.([A-Za-z_][\w-]*)/g)) board.add(m[1]);
		const files = (dir: string): string[] =>
			fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
				const p = path.join(dir, e.name);
				return e.isDirectory() ? (e.name === "components" ? [] : files(p)) : /\.tsx?$/.test(e.name) ? [p] : [];
			});
		for (const f of files(web))
			for (const m of fs.readFileSync(f, "utf8").matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g))
				for (const c of (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, " ").split(/\s+/)) if (c) board.add(c);
		// Shared on purpose: sr-only means the same in both, and dark is the theme class Tailwind's dark variant reads.
		const shared = new Set(["sr-only", "dark"]);
		expect([...board].filter((c) => !shared.has(c) && tw.has(c))).toEqual([]);
	});
});
