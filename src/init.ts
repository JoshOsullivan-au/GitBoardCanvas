// SPDX-License-Identifier: MIT
// `gitboard init`: lays out the lifecycle folder, its stage folders and the feature templates. Never overwrites a file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_FILE, type GitBoardConfig } from "./config.js";

/** The package's `templates/` folder, next to `dist/` once built and next to `src/` in a checkout. */
export const TEMPLATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");

function copyTree(from: string, to: string, created: string[], skipped: string[]): void {
	if (!fs.existsSync(from)) return;
	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, entry.name);
		const dest = path.join(to, entry.name);
		if (entry.isDirectory()) copyTree(src, dest, created, skipped);
		else if (fs.existsSync(dest)) skipped.push(dest);
		else {
			fs.mkdirSync(to, { recursive: true });
			fs.copyFileSync(src, dest);
			created.push(dest);
		}
	}
}

/**
 * Creates `<roadmapDir>/README.md`, one folder per configured stage (with its template README when the templates
 * have one), `<roadmapDir>/templates/feature/` to copy for each new feature, `gitboard.config.json`, and a
 * `.worktrees/` line in `.gitignore` when it is missing (moves work in `.worktrees/`). Returns repo-relative paths.
 */
export function init(root: string, config: GitBoardConfig, templates = TEMPLATES): { created: string[]; skipped: string[] } {
	const created: string[] = [];
	const skipped: string[] = [];
	const lifecycle = path.join(root, config.roadmapDir);
	const copyFile = (src: string, dest: string) => {
		if (!fs.existsSync(src)) return;
		if (fs.existsSync(dest)) return void skipped.push(dest);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(src, dest);
		created.push(dest);
	};
	copyFile(path.join(templates, "roadmap", "README.md"), path.join(lifecycle, "README.md"));
	for (const stage of config.stages) {
		const dir = path.join(lifecycle, stage.folder);
		const template = path.join(templates, "roadmap", stage.folder);
		if (fs.existsSync(template)) copyTree(template, dir, created, skipped);
		if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
			fs.mkdirSync(dir, { recursive: true });
			const keep = path.join(dir, ".gitkeep");
			fs.writeFileSync(keep, "");
			created.push(keep);
		}
	}
	copyTree(path.join(templates, "feature"), path.join(lifecycle, "templates", "feature"), created, skipped);
	const configFile = path.join(root, CONFIG_FILE);
	if (fs.existsSync(configFile)) skipped.push(configFile);
	else {
		fs.writeFileSync(configFile, `${JSON.stringify(config, null, "\t")}\n`);
		created.push(configFile);
	}
	const ignoreFile = path.join(root, ".gitignore");
	const ignore = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8") : "";
	if (!ignore.split(/\r?\n/).some((l) => [".worktrees", ".worktrees/", "/.worktrees", "/.worktrees/"].includes(l.trim()))) {
		fs.writeFileSync(ignoreFile, `${ignore}${ignore && !ignore.endsWith("\n") ? "\n" : ""}.worktrees/\n`);
		created.push(ignoreFile);
	}
	const rel = (p: string) => path.relative(root, p).split(path.sep).join("/");
	return { created: [...new Set(created)].map(rel), skipped: [...new Set(skipped)].map(rel) };
}
