// SPDX-License-Identifier: MIT
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The built CLI, as installed users run it. `npm ci` builds it through `prepare`.
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

let root: string;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-cli-")));
	sh(root, "init", "-q", "-b", "main");
	sh(root, "config", "user.email", "t@example.com");
	sh(root, "config", "user.name", "Test");
	sh(root, "config", "commit.gpgsign", "false");
	for (const s of ["1.ideas", "2.planning", "3.open", "4.in-progress", "5.complete"]) {
		fs.mkdirSync(path.join(root, "roadmap", s), { recursive: true });
		fs.writeFileSync(path.join(root, "roadmap", s, "README.md"), "# Stage\n");
	}
	// Enough features that `list --json` is far past the 64 KiB a pipe holds at once.
	for (let i = 0; i < 300; i++) {
		const open = Array.from({ length: 4 }, (_, n) => `- [ ] Step ${n + 1} of feature ${i}, written long enough to fill the pipe`).join("\n");
		fs.writeFileSync(path.join(root, "roadmap", "3.open", `feature-${i}.md`), `# Feature ${i}\n\n${open}\n`);
	}
	sh(root, "add", "-A");
	sh(root, "commit", "-q", "-m", "init");
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe("cli", () => {
	it("writes the whole of list --json to a pipe before it exits", () => {
		expect(fs.existsSync(CLI), "run npm run build first").toBe(true);
		const out = spawnSync(process.execPath, [CLI, "list", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
		expect(out.status).toBe(0);
		expect(Buffer.byteLength(out.stdout)).toBeGreaterThan(64 * 1024);
		const board = JSON.parse(out.stdout) as { cards: unknown[] };
		expect(board.cards).toHaveLength(300);
	});
});
