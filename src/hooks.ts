// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";

import type { GitBoardConfig } from "./config.js";
import { runLint } from "./lint.js";
import type { MoveInput } from "./types.js";

/** Single-quote a value for `sh -c`. */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The `hooks.onEnter` commands for the target stage (keyed by id or folder), placeholders substituted and shell-quoted. */
export function resolveHooks(config: GitBoardConfig, input: MoveInput, newPath: string): string[] {
	const target = config.stages[input.to - 1];
	if (!target) return [];
	const keyed = config.hooks.onEnter;
	const commands = [...(keyed[String(input.to)] ?? []), ...(target.folder in keyed ? (keyed[target.folder] ?? []) : [])];
	const values: Record<string, string> = {
		slug: input.slug,
		from: config.stages[input.from - 1]?.folder ?? String(input.from),
		to: target.folder,
		path: newPath,
	};
	return commands.map((c) => c.replace(/\{(slug|from|to|path)\}/g, (_m, k: string) => shellQuote(values[k] ?? "")));
}

export const BUILTIN_LINT = "gitboard lint";

/** Run one command with `sh -c` in `cwd`; throws with its output on a non-zero exit. */
export function runCommand(cwd: string, command: string): void {
	try {
		execFileSync("sh", ["-c", command], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string };
		throw new Error(`${command} failed\n${[e.stdout, e.stderr].filter(Boolean).join("\n").trim()}`);
	}
}

/** Every command a move runs: the hooks, then the gate (built-in lint, then `lint.command`). */
export function gateCommands(config: GitBoardConfig, hooks: string[]): string[] {
	return [...hooks, ...(config.lint.builtin ? [BUILTIN_LINT] : []), ...(config.lint.command ? [config.lint.command] : [])];
}

/** Run the planned commands in the move worktree; any failure throws. */
export function runGate(wt: string, config: GitBoardConfig, commands: string[]): void {
	for (const c of commands) {
		if (c === BUILTIN_LINT) {
			const result = runLint(wt, config);
			if (!result.ok) throw new Error(`${BUILTIN_LINT} failed\n${result.problems.join("\n")}`);
		} else runCommand(wt, c);
	}
}
