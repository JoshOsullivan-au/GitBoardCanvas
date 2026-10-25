// SPDX-License-Identifier: MIT
// `gitboard update [--check]`: brings the running install up to date. A linked clone fast-forwards to its upstream and
// rebuilds; a global npm install moves to the latest published version; a project's own copy is left to the project,
// whose lockfile pins it, and gets the command to run. Never stashes, resets or force-updates.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { buildInfo, staleBuild, versionLine } from "./build-info.js";
import { git } from "./git.js";

const PACKAGE = "gitboard-canvas";
const CHANGELOG = "https://github.com/JoshOsullivan-au/GitBoardCanvas/blob/main/CHANGELOG.md";

export type UpdateOptions = { check: boolean; out: (line: string) => void };

/** Runs npm in `cwd`, its output passed through so a build or install shows its progress. */
function npm(cwd: string, args: string[], capture = false): string {
	return (
		execFileSync("npm", args, {
			cwd,
			encoding: "utf8",
			stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
			shell: process.platform === "win32",
		}) ?? ""
	).trim();
}

function lockHash(root: string): string {
	const lock = path.join(root, "package-lock.json");
	return fs.existsSync(lock) ? createHash("sha256").update(fs.readFileSync(lock)).digest("hex") : "";
}

/** A clone run through `npm link`: fast-forward the checked-out branch to its upstream, then rebuild. */
function updateClone(root: string, { check, out }: UpdateOptions): number {
	const changed = git(root, ["status", "--porcelain", "--untracked-files=no"]).trim();
	if (changed) {
		out(`${root} has uncommitted or conflicted changes; commit or resolve them first:\n${changed}`);
		return 1;
	}
	let upstream: string;
	try {
		upstream = git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).trim();
	} catch {
		out(`${root} is not on a branch that tracks a remote; check out main first`);
		return 1;
	}
	git(root, ["fetch", "--quiet"]);
	const behind = Number(git(root, ["rev-list", "--count", `HEAD..${upstream}`]).trim());
	const ahead = Number(git(root, ["rev-list", "--count", `${upstream}..HEAD`]).trim());
	const stale = staleBuild(root, buildInfo(root)) !== null;

	if (behind === 0) {
		out(`up to date with ${upstream} at ${versionLine(buildInfo(root))}`);
		if (!stale) return 0;
		if (check) {
			out("the build is older than the checkout; run `gitboard update` to rebuild");
			return 0;
		}
		npm(root, ["run", "build"]);
		out(`rebuilt: ${versionLine(buildInfo(root))}`);
		return 0;
	}
	if (ahead > 0) {
		out(`${root} has ${ahead} commit(s) that ${upstream} does not; it cannot fast-forward, so merge or land them first`);
		return 1;
	}
	const log = git(root, ["log", "--oneline", "--no-decorate", "-20", `HEAD..${upstream}`]).trim();
	if (check) {
		out(`${behind} commit(s) behind ${upstream}:\n${log}`);
		return 0;
	}
	const from = versionLine(buildInfo(root));
	const lock = lockHash(root);
	git(root, ["merge", "--ff-only", "--quiet", upstream]);
	if (lockHash(root) !== lock) npm(root, ["ci"]);
	npm(root, ["run", "build"]);
	out(`updated ${from} -> ${versionLine(buildInfo(root))}, ${behind} commit(s):\n${log}`);
	out(`changes: ${CHANGELOG}`);
	return 0;
}

/** An install from the npm registry: global installs update in place; a project's copy is pinned by the project. */
function updateInstall(root: string, { check, out }: UpdateOptions): number {
	const current = buildInfo(root).version;
	let latest: string;
	try {
		latest = npm(root, ["view", PACKAGE, "version"], true);
	} catch {
		out(`could not read the latest ${PACKAGE} version from the npm registry`);
		return 1;
	}
	if (latest === current) {
		out(`up to date at ${current}`);
		return 0;
	}
	let globalRoot = "";
	try {
		globalRoot = npm(root, ["root", "-g"], true);
	} catch {
		// No global root: treat it as a project's copy.
	}
	const isGlobal = globalRoot !== "" && path.resolve(root) === path.resolve(globalRoot, PACKAGE);
	if (!isGlobal) {
		out(`${current} -> ${latest} available. This copy belongs to a project; in that project run:`);
		out(`  npm install -D ${PACKAGE}@${latest}`);
		out(`changes: ${CHANGELOG}`);
		return 0;
	}
	if (check) {
		out(`${current} -> ${latest} available; run \`gitboard update\` to install it`);
		return 0;
	}
	npm(root, ["install", "-g", `${PACKAGE}@${latest}`]);
	out(`updated ${current} -> ${latest}`);
	out(`changes: ${CHANGELOG}`);
	return 0;
}

/** Updates the install at `pkgRoot` (the folder holding this package's package.json). */
export function update(pkgRoot: string, opts: UpdateOptions): number {
	try {
		return fs.existsSync(path.join(pkgRoot, ".git")) ? updateClone(pkgRoot, opts) : updateInstall(pkgRoot, opts);
	} catch (error) {
		opts.out(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
