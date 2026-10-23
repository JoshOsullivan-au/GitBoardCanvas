// SPDX-License-Identifier: MIT
// Puts tests/fixtures/gh.mjs first on PATH as `gh`, so pipeline and server tests read fixture pull requests and no
// test reaches github.com. `prs` sets the next answer; `fail` makes every call (or only the status call) exit 1;
// `calls` lists each argv.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(import.meta.dirname, "fixtures/gh.mjs");

export type FakeGh = {
	prs: (rows: unknown[]) => void;
	fail: (on: boolean | "status") => void;
	statusDelay: (ms: number) => void;
	calls: () => string[][];
	restore: () => void;
};

export function fakeGh(): FakeGh {
	if (process.env.GH_FAKE_PRS) throw new Error("fakeGh: restore the previous fake gh first");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-gh-"));
	const bin = path.join(dir, "gh");
	fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${SCRIPT}" "$@"\n`, { mode: 0o755 });
	const log = path.join(dir, "calls.log");
	const prs = path.join(dir, "prs.json");
	const before = { PATH: process.env.PATH, GH_FAKE_LOG: process.env.GH_FAKE_LOG, GH_FAKE_PRS: process.env.GH_FAKE_PRS, GH_FAKE_FAIL: process.env.GH_FAKE_FAIL, GH_FAKE_STATUS_DELAY: process.env.GH_FAKE_STATUS_DELAY };
	process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
	process.env.GH_FAKE_LOG = log;
	process.env.GH_FAKE_PRS = prs;
	delete process.env.GH_FAKE_FAIL;
	delete process.env.GH_FAKE_STATUS_DELAY;
	return {
		prs: (rows) => fs.writeFileSync(prs, JSON.stringify(rows)),
		fail: (on) => {
			if (on) process.env.GH_FAKE_FAIL = on === "status" ? "status" : "1";
			else delete process.env.GH_FAKE_FAIL;
		},
		statusDelay: (ms) => {
			process.env.GH_FAKE_STATUS_DELAY = String(ms);
		},
		calls: () =>
			fs.existsSync(log)
				? fs
						.readFileSync(log, "utf8")
						.split("\n")
						.filter(Boolean)
						.map((l) => JSON.parse(l) as string[])
				: [],
		restore: () => {
			for (const [k, v] of Object.entries(before)) {
				if (v === undefined) delete process.env[k];
				else process.env[k] = v;
			}
			fs.rmSync(dir, { recursive: true, force: true });
		},
	};
}

/** One fixture pull request: the `gh pr list` fields plus the status query's (`checkState` is the rollup state). */
export function prRow(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		number: 1,
		title: "A change",
		url: "https://github.example/o/r/pull/1",
		isDraft: false,
		headRefName: "feature/x",
		files: [],
		checkState: null,
		reviewDecision: "",
		mergeable: "MERGEABLE",
		...over,
	};
}
