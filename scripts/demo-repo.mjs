// SPDX-License-Identifier: MIT
// Builds a demo repository for trying GitBoard Canvas and for the README screenshot: a fictional notes app with
// features in every stage, dependencies, open decisions, phases, backdated history, and worktrees holding WIP,
// staged and committed work.
//   node scripts/demo-repo.mjs <empty-or-missing-folder>
//   node dist/cli.js serve        (from inside that folder)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || (fs.existsSync(dir) && fs.readdirSync(dir).length)) {
	console.error("Usage: node scripts/demo-repo.mjs <empty-or-missing-folder>");
	process.exit(1);
}

const STAGES = ["1.ideas", "2.planning", "3.open", "4.in-progress", "5.complete"];
const git = (cwd, args, date) =>
	execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env,
	}).toString();
const write = (rel, text) => {
	fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
	fs.writeFileSync(path.join(dir, rel), text);
};
const ticks = (done, open) => [...done.map((t) => `- [x] ${t}`), ...open.map((t) => `- [ ] ${t}`)].join("\n");

// [slug, stage, title, done items, open items, extra markdown, phases]
const FEATURES = [
	["editor-ai-summaries", 1, "AI summaries", [], ["Prototype summary prompt"], "See also `editor-search`."],
	["editor-whiteboard", 1, "Whiteboard canvas", [], ["Spike a canvas renderer"], ""],
	["sync-p2p-share", 1, "Peer-to-peer sharing", [], ["Research WebRTC relays"], "Builds on `sync-engine-v2`."],
	["mobile-widgets", 1, "Home screen widgets", [], ["Pick widget sizes"], ""],
	["billing-team-plans", 1, "Team plans", [], ["Draft plan tiers"], "Needs `billing-usage-metering`."],
	["platform-plugin-api", 1, "Plugin API", [], ["Write the extension contract"], ""],
	["editor-comments", 2, "Inline comments", ["Scope agreed"], ["Thread model", "Notifications"], "Depends on `editor-realtime-cursors`.\n\n## Open decisions\n\n- Resolve threads per paragraph or per document?"],
	["sync-offline-mode", 2, "Offline mode", ["Conflict rules drafted"], ["Storage quota", "Queue replay"], "## Open decisions\n\n- IndexedDB or SQLite (WASM) for the local store?\n- How long do queued edits wait before warning?"],
	["billing-usage-metering", 2, "Usage metering", [], ["Event schema", "Daily rollup"], "Depends on `billing-stripe-checkout`."],
	["mobile-share-sheet", 2, "Share sheet", ["iOS extension spike"], ["Android intent"], ""],
	["editor-tables", 3, "Tables", ["Schema for cells"], ["Column resize", "Paste from spreadsheets"], "Code: `src/editor/tables.ts`.", [["01-cell-model", "Cell model", 1, 1], ["02-toolbar", "Table toolbar", 0, 2]]],
	["editor-realtime-cursors", 3, "Realtime cursors", [], ["Presence channel", "Cursor colours"], "Depends on `sync-engine-v2`."],
	["sync-conflict-ui", 3, "Conflict review screen", [], ["Diff view", "Keep both"], "After `sync-engine-v2` lands."],
	["billing-invoices", 3, "Invoices", ["PDF layout"], ["Tax lines", "Email delivery"], "## Ops actions\n\n- [ ] Register the sender domain with the email provider."],
	["mobile-offline-cache", 3, "Offline cache", [], ["Cache budget", "Eviction"], "Requires `sync-offline-mode`."],
	["platform-audit-log", 3, "Audit log", ["Event list"], ["Retention policy", "Export"], ""],
	["sync-engine-v2", 4, "Sync engine v2", ["Operation log", "Server merge"], ["Client replay", "Load test"], "Code: `src/sync/engine.ts`, `src/sync/oplog.ts`.", [["01-oplog", "Operation log", 2, 0], ["02-merge", "Server merge", 2, 0], ["03-replay", "Client replay", 0, 3]]],
	["billing-stripe-checkout", 4, "Checkout", ["Price table", "Webhook handler"], ["Receipts"], "Code: `src/billing/checkout.ts`.\n\n## Open decisions\n\n- Monthly and annual at launch, or monthly first?"],
	["mobile-push-notifications", 4, "Push notifications", ["APNs keys"], ["FCM", "Quiet hours"], "Code: `src/mobile/push.ts`."],
	["platform-sso", 4, "Single sign-on", ["SAML spike"], ["SCIM", "Admin screen"], "Depends on `platform-audit-log`."],
	["editor-slash-commands", 4, "Slash commands", ["Command menu", "Headings", "Lists"], ["Embeds"], ""],
	["editor-markdown-export", 5, "Markdown export", ["Export", "Front matter", "Images"], [], ""],
	["editor-search", 5, "Full-text search", ["Index", "Ranking", "Filters"], [], ""],
	["sync-encryption", 5, "End-to-end encryption", ["Key exchange", "Recovery codes"], [], ""],
	["billing-free-tier", 5, "Free tier", ["Limits", "Upgrade prompts"], [], ""],
	["mobile-dark-mode", 5, "Dark mode", ["Tokens", "System setting"], [], ""],
	["platform-ci-pipeline", 5, "CI pipeline", ["Lint", "Tests", "Preview builds"], [], ""],
	["platform-rate-limits", 5, "Rate limits", ["Per-user buckets"], [], "See also `platform-audit-log`."],
];

fs.mkdirSync(dir, { recursive: true });
git(dir, ["init", "-q", "-b", "main"]);
git(dir, ["config", "user.name", "Demo Maintainer"]);
git(dir, ["config", "user.email", "demo@example.com"]);
git(dir, ["config", "commit.gpgsign", "false"]);

write(
	"gitboard.config.json",
	`${JSON.stringify(
		{
			github: false,
			defaultGroup: "Platform",
			groups: [
				{ name: "Editor", match: "^editor-", icon: "PaintBrush" },
				{ name: "Sync", match: "^sync-", icon: "Cloud" },
				{ name: "Billing", match: "^billing-", icon: "CreditCard" },
				{ name: "Mobile", match: "^mobile-", icon: "DeviceMobile" },
				{ name: "Platform", match: "^platform-", icon: "Cube" },
			],
		},
		null,
		"\t",
	)}\n`,
);
write(".gitignore", ".worktrees/\n");
for (const s of STAGES) write(`roadmap/${s}/.gitkeep`, "");
for (const f of ["src/editor/tables.ts", "src/sync/engine.ts", "src/sync/oplog.ts", "src/billing/checkout.ts", "src/mobile/push.ts"]) {
	write(f, `export {};\n`);
}
git(dir, ["add", "-A"]);
git(dir, ["commit", "-q", "-m", "Start the notes app"], "2026-09-01T09:00:00+10:00");

// One commit per feature, spread over seven weeks, so created and landed dates differ.
FEATURES.forEach(([slug, stage, title, done, open, extra, phases], i) => {
	const base = `roadmap/${STAGES[stage - 1]}/${slug}`;
	write(`${base}.md`, `# ${title}\n\n${ticks(done, open)}\n${extra ? `\n${extra}\n` : ""}`);
	for (const [file, name, d, o] of phases ?? []) {
		const num = file.slice(0, 2);
		write(`${base}/phases/${file}.md`, `# ${num} ${name}\n\n${ticks(Array.from({ length: d }, (_, k) => `Step ${k + 1}`), Array.from({ length: o }, (_, k) => `Step ${d + k + 1}`))}\n`);
	}
	const day = new Date(Date.UTC(2026, 8, 2) + i * 1.7 * 86_400_000).toISOString();
	git(dir, ["add", "-A"]);
	git(dir, ["commit", "-q", "-m", `Plan ${slug}`], day);
});

// Work in flight on feature branches.
const tree = (branch) => {
	const wt = path.join(dir, ".worktrees", branch);
	git(dir, ["worktree", "add", "-q", "-b", branch, wt, "main"]);
	return wt;
};
const touch = (wt, rel, text) => {
	fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true });
	fs.writeFileSync(path.join(wt, rel), text);
};

let wt = tree("sync-engine-v2");
for (const [n, f] of [["1", "src/sync/engine.ts"], ["2", "src/sync/oplog.ts"], ["3", "src/sync/replay.ts"]]) {
	touch(wt, f, `export const step = ${n};\n`);
	git(wt, ["add", "-A"]);
	git(wt, ["commit", "-q", "-m", `sync: step ${n}`], `2026-10-2${n}T10:00:00+10:00`);
}

wt = tree("editor-tables");
touch(wt, "src/editor/tables.ts", "export const columns = [];\n");
touch(wt, "src/editor/table-toolbar.ts", "export {};\n");

wt = tree("billing-stripe-checkout");
touch(wt, "src/billing/checkout.ts", "export const receipts = true;\n");
touch(wt, "src/billing/receipt.ts", "export {};\n");
git(wt, ["add", "-A"]);

wt = tree("mobile-push-notifications");
touch(wt, "src/mobile/push.ts", "export const quietHours = [22, 7];\n");

console.log(`Demo repository ready: ${dir}\nRun: cd "${dir}" && node "${path.resolve("dist/cli.js")}" serve`);
