// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildInfo, staleBuild, versionLine } from "../src/build-info.js";

function pkg(stamp: object | null): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-build-"));
	fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "1.2.3" }));
	if (stamp) {
		fs.mkdirSync(path.join(dir, "dist"));
		fs.writeFileSync(path.join(dir, "dist", "build.json"), JSON.stringify(stamp));
	}
	return dir;
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe("build info", () => {
	it("falls back to the package version without a stamp", () => {
		const info = buildInfo(pkg(null));
		expect(info).toEqual({ version: "1.2.3", commit: null, dirty: false, builtAt: null });
		expect(versionLine(info)).toBe("1.2.3");
	});

	it("names the commit, local changes and build date", () => {
		const info = buildInfo(pkg({ commit: "6681e5a0123456789", dirty: true, builtAt: "2026-10-25T01:00:00.000Z" }));
		expect(versionLine(info)).toBe("1.2.3 (6681e5a+changes, built 25/10/2026)");
	});

	it("shows the version that was built, not a newer checkout's", () => {
		expect(buildInfo(pkg({ version: "1.0.0", commit: "6681e5a0123456789" })).version).toBe("1.0.0");
	});

	it("warns only when a checkout's HEAD moved past the build", () => {
		const dir = pkg(null);
		git(dir, "init", "-q");
		git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "one");
		const head = git(dir, "rev-parse", "HEAD");
		expect(staleBuild(dir, { version: "1.2.3", commit: head, dirty: false, builtAt: null })).toBeNull();
		const stale = staleBuild(dir, { version: "1.2.3", commit: "0".repeat(40), dirty: false, builtAt: null });
		expect(stale).toContain(`is at ${head.slice(0, 7)}`);
		expect(stale).toContain("npm run build");
		expect(staleBuild(pkg(null), { version: "1.2.3", commit: head, dirty: false, builtAt: null })).toBeNull();
	});
});
