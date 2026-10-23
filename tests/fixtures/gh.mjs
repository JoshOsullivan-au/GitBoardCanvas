// SPDX-License-Identifier: MIT
// A stand-in for the GitHub CLI. It logs each call to GH_FAKE_LOG, one JSON argv per line, then answers from the
// rows in GH_FAKE_PRS: `gh pr list --json <fields>` with those fields, and `gh api graphql` with the pull request
// status query's shape (each row's `checkState`, `reviewDecision` and `mergeable`). GH_FAKE_FAIL=1 fails every call
// and GH_FAKE_FAIL=status only the GraphQL one, exiting 1 as gh does; so does a missing fixture.
import fs from "node:fs";

const args = process.argv.slice(2);
if (process.env.GH_FAKE_LOG) fs.appendFileSync(process.env.GH_FAKE_LOG, `${JSON.stringify(args)}\n`);
const fail = (msg) => {
	process.stderr.write(`gh: ${msg}\n`);
	process.exit(1);
};
const mode = process.env.GH_FAKE_FAIL;
const list = args[0] === "pr" && args[1] === "list";
const graphql = args[0] === "api" && args[1] === "graphql";
if (mode === "1" || (!list && !graphql)) fail("fake failure");
if (graphql && mode === "status") fail("HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)");
let rows;
try {
	rows = JSON.parse(fs.readFileSync(process.env.GH_FAKE_PRS ?? "", "utf8"));
} catch {
	fail("no fixture");
}
if (list) {
	const fields = (args[args.indexOf("--json") + 1] ?? "").split(",");
	process.stdout.write(JSON.stringify(rows.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])))));
} else {
	const nodes = rows.map((r) => ({
		number: r.number,
		reviewDecision: r.reviewDecision,
		mergeable: r.mergeable,
		commits: { nodes: [{ commit: { statusCheckRollup: r.checkState ? { state: r.checkState } : null } }] },
	}));
	process.stdout.write(JSON.stringify({ data: { repository: { pullRequests: { nodes } } } }));
}
