// SPDX-License-Identifier: MIT
// The live routes: every page (from a Next.js app router folder, or a command that lists them), minus what production
// does not serve.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { ArchitectureConfig } from "./config.js";

export type LiveRoute = { route: string; area: string; file: string };

/**
 * Every `page.*` under the app folder, as the route Next serves it: route groups and parallel slots dropped, private
 * folders and intercepting routes (`(.)x`, `(..)x`, `(...)x`, which render another route's URL) skipped.
 */
export function pageRoutes(root: string, appDir: string): { route: string; file: string }[] {
	const app = path.join(root, appDir);
	const out: { route: string; file: string }[] = [];
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith("_") && !entry.name.startsWith(".") && !entry.name.startsWith("(.")) walk(full);
			} else if (/^page\.(t|j)sx?$/.test(entry.name)) {
				const segments = path
					.relative(app, dir)
					.split(path.sep)
					.filter((s) => s && !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"));
				out.push({ route: `/${segments.join("/")}`, file: path.relative(root, full).split(path.sep).join("/") });
			}
		}
	};
	if (fs.existsSync(app)) walk(app);
	const seen = new Set<string>();
	return out.sort((a, b) => a.route.localeCompare(b.route)).filter((r) => !seen.has(r.route) && seen.add(r.route));
}

/** The area a route sits in: first matching rule, else the default. */
export function areaOf(c: ArchitectureConfig, route: string): string {
	return c.areas.find((a) => new RegExp(a.match, "i").test(route))?.name ?? c.defaultArea;
}

/** A command's JSON output, run at the repo root with `input` on stdin. */
function runJson(root: string, command: string, input: string): unknown {
	return JSON.parse(execSync(command, { cwd: root, encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }));
}

/** The routes `routesCommand` keeps: it reads every page route (a JSON array) on stdin and prints the live ones. */
function commandRoutes(root: string, command: string, routes: string[]): Set<string> {
	const list = runJson(root, command, JSON.stringify(routes));
	if (!Array.isArray(list) || !list.every((r) => typeof r === "string")) throw new Error("routesCommand must print a JSON array of route strings");
	return new Set(list);
}

/**
 * The page routes `pagesCommand` prints: route strings, or `{ route, file }` for a route with a source file, sorted with
 * duplicates dropped. Each route starts with `/`.
 */
export function commandPages(root: string, command: string): { route: string; file: string }[] {
	const list = runJson(root, command, "");
	const page = (r: unknown): { route: unknown; file: unknown } => (typeof r === "object" && r !== null ? (r as { route: unknown; file: unknown }) : { route: r, file: "" });
	if (!Array.isArray(list) || !list.map(page).every((p) => typeof p.route === "string" && p.route.startsWith("/")))
		throw new Error('pagesCommand must print a JSON array of routes starting with /, as strings or { "route", "file" }');
	const pages = list.map(page).map((p) => ({ route: String(p.route), file: typeof p.file === "string" ? p.file : "" }));
	const seen = new Set<string>();
	return pages.sort((a, b) => a.route.localeCompare(b.route)).filter((r) => !seen.has(r.route) && seen.add(r.route));
}

/** The pages production serves, each with its area and page file. */
export function liveRoutes(root: string, c: ArchitectureConfig): LiveRoute[] {
	const all = c.pagesCommand ? commandPages(root, c.pagesCommand) : pageRoutes(root, c.appDir);
	const keep = c.routesCommand
		? ((live: Set<string>) => (route: string) => live.has(route))(commandRoutes(root, c.routesCommand, all.map((r) => r.route)))
		: ((rules: RegExp[]) => (route: string) => !rules.some((r) => r.test(route)))(c.exclude.map((p) => new RegExp(p)));
	return all.filter(({ route }) => keep(route)).map(({ route, file }) => ({ route, area: areaOf(c, route), file }));
}
