#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// GitBoard Canvas CLI (`gitboard`): serve the board, move a feature, lint the lifecycle folder, list features, or lay out a new repo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadBoard } from "./board.js";
import { type GitBoardConfig, loadConfig, stagesOf } from "./config.js";
import { mainCheckout, repoRoot } from "./git.js";
import { init } from "./init.js";
import { runLint } from "./lint.js";
import { moveFeature, planMove } from "./move.js";
import { listen } from "./server.js";

const HELP = `GitBoard Canvas: a local kanban for a folder-based product lifecycle

Usage:
  gitboard [serve] [--port N] [--open]   start the board (default port 4610)
  gitboard move <slug> <stage> [--from <stage>] [--dry-run]
                                         move a feature; <stage> is an id, folder or name
  gitboard lint                          check the lifecycle folder
  gitboard list [--json]                 print every feature by stage
  gitboard init                          create the lifecycle folder, templates and config
  gitboard --version | --help
`;

function version(): string {
	const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
	return (JSON.parse(fs.readFileSync(pkg, "utf8")) as { version: string }).version;
}

function flag(args: string[], name: string): string | undefined {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
}

/** A stage by id ("3"), folder ("3.open") or name ("open", case-insensitive). */
export function parseStage(config: GitBoardConfig, value: string | undefined): number | null {
	if (!value) return null;
	const v = value.trim().toLowerCase();
	for (const s of stagesOf(config)) {
		if (v === String(s.id) || v === s.folder.toLowerCase() || v === s.name.toLowerCase()) return s.id;
	}
	return null;
}

function openBrowser(url: string): void {
	const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	import("node:child_process").then(({ spawn }) => spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref());
}

async function main(argv: string[]): Promise<number> {
	const [first, ...rest] = argv;
	if (first === "--help" || first === "-h" || first === "help") {
		process.stdout.write(HELP);
		return 0;
	}
	if (first === "--version" || first === "-v") {
		process.stdout.write(`${version()}\n`);
		return 0;
	}
	const cmd = !first || first.startsWith("--") ? "serve" : first;
	const args = !first || first.startsWith("--") ? argv : rest;
	let root: string;
	try {
		root = mainCheckout(repoRoot());
	} catch {
		process.stderr.write("gitboard: run this inside a git repository\n");
		return 1;
	}
	const config = loadConfig(root);

	if (cmd === "init") {
		const { created, skipped } = init(root, config);
		for (const f of created) process.stdout.write(`created ${f}\n`);
		for (const f of skipped) process.stdout.write(`kept    ${f}\n`);
		process.stdout.write(`\nNext: commit the new files, then run \`gitboard\`.\n`);
		return 0;
	}
	if (!fs.existsSync(path.join(root, config.roadmapDir))) {
		process.stderr.write(`gitboard: no ${config.roadmapDir}/ folder here; run \`gitboard init\` first\n`);
		return 1;
	}
	if (cmd === "serve") {
		const port = Number(flag(args, "--port") ?? process.env.GITBOARD_PORT ?? config.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			process.stderr.write("gitboard: --port must be 1 to 65535\n");
			return 1;
		}
		const server = await listen({ root, config, port });
		process.stderr.write(`gitboard: ${server.url} (${path.join(root, config.roadmapDir)}). Press Ctrl+C to stop.\n`);
		if (args.includes("--open")) openBrowser(server.url);
		return new Promise<number>(() => {});
	}
	if (cmd === "lint") {
		const { ok, problems } = runLint(root, config);
		for (const p of problems) process.stderr.write(`${p}\n`);
		process.stderr.write(ok ? "gitboard lint: ok\n" : `gitboard lint: ${problems.length} problem(s)\n`);
		return ok ? 0 : 1;
	}
	if (cmd === "list") {
		const board = loadBoard(root, config, { pipeline: null });
		if (args.includes("--json")) {
			process.stdout.write(`${JSON.stringify(board, null, 2)}\n`);
			return 0;
		}
		for (const s of board.stages) {
			const cards = board.cards.filter((c) => c.stage === s.id);
			process.stdout.write(`\n${s.id} ${s.name} (${cards.length})\n`);
			for (const c of cards) {
				const ticks = c.total ? ` ${c.done}/${c.total}` : "";
				process.stdout.write(`  ${c.slug}${ticks}${c.deps.length ? " blocked-by:" + c.deps.length : ""}\n`);
			}
		}
		return 0;
	}
	if (cmd === "move") {
		const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--from");
		const [slug, toArg] = positional;
		const to = parseStage(config, toArg);
		if (!slug || !to) {
			process.stderr.write("Usage: gitboard move <slug> <stage> [--from <stage>] [--dry-run]\n");
			return 1;
		}
		let from = parseStage(config, flag(args, "--from"));
		if (!from) {
			const matches = loadBoard(root, config, { pipeline: null }).cards.filter((c) => c.slug === slug);
			if (matches.length !== 1) {
				process.stderr.write(
					matches.length ? `gitboard: ${slug} is in more than one stage; pass --from\n` : `gitboard: no feature named ${slug}\n`,
				);
				return 1;
			}
			from = matches[0].stage;
		}
		const input = { slug, from, to };
		try {
			if (args.includes("--dry-run")) {
				const plan = planMove(root, config, input);
				process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
				return plan.blocked ? 1 : 0;
			}
			const { plan, commit } = moveFeature(root, config, input);
			for (const w of plan.warnings) process.stderr.write(`gitboard: ${w}\n`);
			process.stderr.write(
				`gitboard: ${slug} moved, links rewritten in ${plan.rewrites.length} file(s); ${config.mainBranch} at ${commit.slice(0, 8)}\n`,
			);
			return 0;
		} catch (error) {
			process.stderr.write(`gitboard: ${error instanceof Error ? error.message : String(error)}\n`);
			return 1;
		}
	}
	process.stderr.write(HELP);
	return 1;
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error: unknown) => {
		process.stderr.write(`gitboard: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	},
);
