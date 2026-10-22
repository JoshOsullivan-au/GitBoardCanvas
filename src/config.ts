// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";

import type { Stage } from "./types.js";

export const CONFIG_FILE = "gitboard.config.json";

/** `icon` names a Phosphor icon the board ships (see docs/configuration.md); unknown names fall back to Stack. */
export type GroupRule = { name: string; match: string; icon?: string };

export type GitBoardConfig = {
	/** Repo-relative folder that holds the stage folders. */
	roadmapDir: string;
	/** The branch moves land on. */
	mainBranch: string;
	port: number;
	/** In lifecycle order; ids are 1-based positions. Two to nine stages. */
	stages: { folder: string; name: string }[];
	/** First match on the slug wins (JavaScript regex source, case-insensitive). */
	groups: GroupRule[];
	defaultGroup: string;
	/** Top-level folders whose paths in feature docs tie code changes to a feature; "auto" uses every tracked top-level folder. */
	codeRoots: string[] | "auto";
	/** Repo-relative path prefixes whose files a move never rewrites (generated indexes, append-only logs). */
	rewriteSkip: string[];
	lint: {
		/** Run GitBoard's own structure checks as the move gate. */
		builtin: boolean;
		/** Extra gate command run in the move worktree; non-zero exit refuses the move. */
		command: string | null;
		/** When set, every phase file must carry these `## ` headings. */
		phaseHeadings: string[];
		/** When set, every feature folder README must carry these `## ` headings. */
		readmeSections: string[];
	};
	/** Commands run in the move worktree when a feature enters a stage, keyed by stage folder or id. Placeholders: {slug} {from} {to} {path}. */
	hooks: { onEnter: Record<string, string[]> };
	/** Read open pull requests through the GitHub CLI (`gh`). */
	github: boolean;
};

export const DEFAULT_STAGES: { folder: string; name: string }[] = [
	{ folder: "1.ideas", name: "Ideas" },
	{ folder: "2.planning", name: "Planning" },
	{ folder: "3.open", name: "Open" },
	{ folder: "4.in-progress", name: "In progress" },
	{ folder: "5.complete", name: "Complete" },
];

export const DEFAULT_CONFIG: GitBoardConfig = {
	roadmapDir: "roadmap",
	mainBranch: "main",
	port: 4610,
	stages: DEFAULT_STAGES,
	groups: [],
	defaultGroup: "General",
	codeRoots: "auto",
	rewriteSkip: ["node_modules/", "dist/", "build/", ".next/"],
	lint: { builtin: true, command: null, phaseHeadings: [], readmeSections: [] },
	hooks: { onEnter: {} },
	github: true,
};

const STAGE_FOLDER = /^[1-9]\.[a-z0-9][a-z0-9-]*$/;

/** Throws with every problem found, so a bad config fails once with the whole list. */
export function validateConfig(c: GitBoardConfig): void {
	const errors: string[] = [];
	if (!c.roadmapDir || path.isAbsolute(c.roadmapDir) || c.roadmapDir.split(/[\\/]/).includes(".."))
		errors.push("roadmapDir must be a repo-relative folder");
	if (!/^[\w./-]+$/.test(c.mainBranch)) errors.push("mainBranch is not a branch name");
	if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) errors.push("port must be 1 to 65535");
	if (c.stages.length < 2 || c.stages.length > 9) errors.push("stages must list two to nine stages");
	c.stages.forEach((s, i) => {
		if (!STAGE_FOLDER.test(s.folder) || !s.folder.startsWith(`${i + 1}.`))
			errors.push(`stage ${i + 1} folder "${s.folder}" must look like "${i + 1}.name"`);
		if (!s.name?.trim()) errors.push(`stage ${i + 1} needs a name`);
	});
	for (const g of c.groups) {
		try {
			new RegExp(g.match, "i");
		} catch {
			errors.push(`group "${g.name}" has an invalid match pattern`);
		}
	}
	if (errors.length) throw new Error(`${CONFIG_FILE}: ${errors.join("; ")}`);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Type-check every key a user file sets; one error per wrong key, all reported together. */
function checkShape(raw: unknown): string[] {
	if (!isObject(raw)) return ["the file must hold a JSON object"];
	const e: string[] = [];
	const str = (k: string, v: unknown) => v === undefined || typeof v === "string" || void e.push(`${k} must be a string`);
	const bool = (k: string, v: unknown) => v === undefined || typeof v === "boolean" || void e.push(`${k} must be true or false`);
	const strings = (k: string, v: unknown) => v === undefined || isStrings(v) || void e.push(`${k} must be an array of strings`);
	str("roadmapDir", raw.roadmapDir);
	str("mainBranch", raw.mainBranch);
	str("defaultGroup", raw.defaultGroup);
	bool("github", raw.github);
	strings("rewriteSkip", raw.rewriteSkip);
	if (raw.port !== undefined && typeof raw.port !== "number") e.push("port must be a number");
	if (raw.codeRoots !== undefined && raw.codeRoots !== "auto" && !isStrings(raw.codeRoots))
		e.push('codeRoots must be "auto" or an array of strings');
	if (raw.stages !== undefined) {
		if (!Array.isArray(raw.stages)) e.push("stages must be an array");
		else
			raw.stages.forEach((s, i) => {
				if (!isObject(s) || typeof s.folder !== "string" || typeof s.name !== "string")
					e.push(`stages[${i}] must be { "folder": string, "name": string }`);
			});
	}
	if (raw.groups !== undefined) {
		if (!Array.isArray(raw.groups)) e.push("groups must be an array");
		else
			raw.groups.forEach((g, i) => {
				if (!isObject(g) || typeof g.name !== "string" || typeof g.match !== "string" || (g.icon !== undefined && typeof g.icon !== "string"))
					e.push(`groups[${i}] must be { "name": string, "match": string, "icon"?: string }`);
			});
	}
	if (raw.lint !== undefined) {
		if (!isObject(raw.lint)) e.push("lint must be an object");
		else {
			bool("lint.builtin", raw.lint.builtin);
			if (raw.lint.command !== undefined && raw.lint.command !== null && typeof raw.lint.command !== "string")
				e.push("lint.command must be a string or null");
			strings("lint.phaseHeadings", raw.lint.phaseHeadings);
			strings("lint.readmeSections", raw.lint.readmeSections);
		}
	}
	if (raw.hooks !== undefined) {
		const onEnter = isObject(raw.hooks) ? raw.hooks.onEnter : undefined;
		if (!isObject(raw.hooks)) e.push("hooks must be an object");
		else if (onEnter !== undefined) {
			if (!isObject(onEnter)) e.push("hooks.onEnter must be an object");
			else
				for (const [k, v] of Object.entries(onEnter))
					if (!isStrings(v)) e.push(`hooks.onEnter["${k}"] must be an array of strings`);
		}
	}
	return e;
}

/** `./roadmap/` and `roadmap` name the same folder. */
function normaliseDir(dir: string): string {
	return dir.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
}

/** Defaults, overlaid with `gitboard.config.json` at the repo root when present. */
export function loadConfig(root: string): GitBoardConfig {
	const file = path.join(root, CONFIG_FILE);
	let user: Partial<GitBoardConfig> = {};
	if (fs.existsSync(file)) {
		let raw: unknown;
		try {
			raw = JSON.parse(fs.readFileSync(file, "utf8"));
		} catch (error) {
			throw new Error(`${CONFIG_FILE}: ${(error as Error).message}`);
		}
		const problems = checkShape(raw);
		if (problems.length) throw new Error(`${CONFIG_FILE}: ${problems.join("; ")}`);
		user = raw as Partial<GitBoardConfig>;
	}
	const config: GitBoardConfig = {
		...DEFAULT_CONFIG,
		...user,
		lint: { ...DEFAULT_CONFIG.lint, ...(user.lint ?? {}) },
		hooks: { onEnter: { ...(user.hooks?.onEnter ?? {}) } },
	};
	config.roadmapDir = normaliseDir(config.roadmapDir);
	validateConfig(config);
	return config;
}

export function stagesOf(config: GitBoardConfig): Stage[] {
	return config.stages.map((s, i) => ({ id: i + 1, folder: s.folder, name: s.name }));
}

export function stageById(config: GitBoardConfig, id: number): Stage {
	const s = stagesOf(config).find((x) => x.id === id);
	if (!s) throw new Error(`Unknown stage ${id}`);
	return s;
}

export function groupFor(config: GitBoardConfig, slug: string, frontmatterGroup?: string | null): string {
	if (frontmatterGroup?.trim()) return frontmatterGroup.trim();
	for (const g of config.groups) if (new RegExp(g.match, "i").test(slug)) return g.name;
	return config.defaultGroup;
}
