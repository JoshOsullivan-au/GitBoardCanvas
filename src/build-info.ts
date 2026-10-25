// SPDX-License-Identifier: MIT
// Which build is running: the version and commit stamped into dist/build.json at build time, and whether a linked
// checkout (`npm link`, `npm install -g <folder>`) has moved on since that build.
import fs from "node:fs";
import path from "node:path";

import { git } from "./git.js";

export type BuildInfo = { version: string; commit: string | null; dirty: boolean; builtAt: string | null };

/** Reads dist/build.json under `pkgRoot`: the version that was built, falling back to package.json's without a stamp. */
export function buildInfo(pkgRoot: string): BuildInfo {
	const { version } = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")) as { version: string };
	try {
		const stamp = JSON.parse(fs.readFileSync(path.join(pkgRoot, "dist", "build.json"), "utf8")) as Partial<BuildInfo>;
		return { version: stamp.version ?? version, commit: stamp.commit ?? null, dirty: stamp.dirty === true, builtAt: stamp.builtAt ?? null };
	} catch {
		return { version, commit: null, dirty: false, builtAt: null };
	}
}

/** `0.2.0`, or `0.2.0 (6681e5a, built 25/10/2026)` for a build made from a git checkout. */
export function versionLine(info: BuildInfo): string {
	if (!info.commit) return info.version;
	const built = info.builtAt ? `, built ${new Date(info.builtAt).toLocaleDateString("en-AU", { timeZone: "UTC" })}` : "";
	return `${info.version} (${info.commit.slice(0, 7)}${info.dirty ? "+changes" : ""}${built})`;
}

/**
 * When `pkgRoot` is itself a git checkout whose HEAD is not the commit dist/ was built from, the message to show: the
 * checkout was pulled or switched without `npm run build`, so the command runs older code than the folder holds.
 */
export function staleBuild(pkgRoot: string, info: BuildInfo): string | null {
	if (!info.commit || !fs.existsSync(path.join(pkgRoot, ".git"))) return null;
	let head: string;
	try {
		head = git(pkgRoot, ["rev-parse", "HEAD"]).trim();
	} catch {
		return null;
	}
	if (head === info.commit) return null;
	return `this build is ${info.commit.slice(0, 7)} but ${pkgRoot} is at ${head.slice(0, 7)}; run \`npm run build\` there`;
}
