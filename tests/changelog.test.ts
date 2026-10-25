// SPDX-License-Identifier: MIT
// scripts/changelog.mjs, run as `npm version` runs it: in a folder holding CHANGELOG.md, with npm_package_version set.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(import.meta.dirname, "..", "scripts", "changelog.mjs");
const dirs: string[] = [];

function run(changelog: string, args: string[], version = "0.2.0"): { code: number | null; stderr: string; stdout: string; after: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-changelog-"));
	dirs.push(dir);
	fs.writeFileSync(path.join(dir, "CHANGELOG.md"), changelog);
	const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, npm_package_version: version } });
	return { code: r.status, stderr: r.stderr, stdout: r.stdout, after: fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8") };
}

const LOG = ["# Changelog", "", "## Unreleased", "", "### Added", "", "- A thing.", "", "## 0.1.2 (22/10/2026)", "", "- Old.", ""];

afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("changelog release", () => {
	it("files Unreleased under the new version", () => {
		const { code, after } = run(LOG.join("\n"), ["release"]);
		expect(code).toBe(0);
		expect(after).toMatch(/## Unreleased\n\n## 0\.2\.0 \(\d\d\/\d\d\/\d{4}\)\n\n### Added\n\n- A thing\./);
	});

	it("releases a CRLF changelog and keeps its line endings", () => {
		const { code, after } = run(LOG.join("\r\n"), ["release"]);
		expect(code).toBe(0);
		expect(after).toMatch(/## Unreleased\r\n\r\n## 0\.2\.0 \(\d\d\/\d\d\/\d{4}\)\r\n/);
		expect(after.replace(/\r\n/g, "")).not.toContain("\n");
	});

	it("refuses an Unreleased section with only category headings", () => {
		const empty = ["# Changelog", "", "## Unreleased", "", "### Added", "", "### Fixed", "", "## 0.1.2 (22/10/2026)", ""].join("\n");
		const { code, stderr } = run(empty, ["release"]);
		expect(code).not.toBe(0);
		expect(stderr).toContain("Unreleased is empty");
	});

	it("refuses a version that already has a section", () => {
		expect(run(LOG.join("\n"), ["release"], "0.1.2").stderr).toContain("already has a section");
	});

	it("prints one version's notes", () => {
		expect(run(LOG.join("\r\n"), ["notes", "v0.1.2"]).stdout).toBe("- Old.\n");
	});
});
