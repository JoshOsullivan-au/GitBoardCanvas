// SPDX-License-Identifier: MIT
// Git exports its repo variables (GIT_DIR, GIT_INDEX_FILE, ...) to hooks. A test run from a hook that kept them would
// point every temporary repo's git at the real repo: commits, config and branches would land there.
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("test environment", () => {
	it("carries none of git's repo variables", () => {
		const local = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).split("\n").filter(Boolean);
		expect(local.length).toBeGreaterThan(0);
		expect(local.filter((v) => process.env[v] !== undefined)).toEqual([]);
	});
});
