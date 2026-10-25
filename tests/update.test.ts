// SPDX-License-Identifier: MIT
// `gitboard update` on a linked clone: an origin, the clone the command runs from, and a second clone that pushes a
// newer version. The clone's build script stamps dist/build.json the way the real build does.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildInfo } from "../src/build-info.js";
import { update } from "../src/update.js";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const STAMP = `const {execFileSync}=require("node:child_process"),fs=require("node:fs");fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/build.json",JSON.stringify({commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim()}))`;

let tmp: string;
let clone: string;
let other: string;

function identify(dir: string): void {
	sh(dir, "config", "user.email", "t@example.com");
	sh(dir, "config", "user.name", "Test");
	sh(dir, "config", "commit.gpgsign", "false");
}

function release(dir: string, version: string): void {
	fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "gitboard-canvas", version, scripts: { build: "node stamp.cjs" } }));
	sh(dir, "add", "-A");
	sh(dir, "commit", "-q", "-m", `release ${version}`);
}

function run(check = false): { code: number; out: string } {
	const lines: string[] = [];
	const code = update(clone, { check, out: (l) => lines.push(l) });
	return { code, out: lines.join("\n") };
}

beforeEach(() => {
	tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-update-")));
	const origin = path.join(tmp, "origin.git");
	sh(tmp, "init", "-q", "--bare", "-b", "main", origin);
	other = path.join(tmp, "other");
	sh(tmp, "clone", "-q", origin, other);
	identify(other);
	fs.writeFileSync(path.join(other, "stamp.cjs"), STAMP);
	fs.writeFileSync(path.join(other, ".gitignore"), "dist/\n");
	release(other, "1.0.0");
	sh(other, "push", "-q", "-u", "origin", "main");
	clone = path.join(tmp, "clone");
	sh(tmp, "clone", "-q", origin, clone);
	identify(clone);
	execFileSync("npm", ["run", "build", "--silent"], { cwd: clone, shell: process.platform === "win32" });
});

afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe("gitboard update on a linked clone", () => {
	it("says so when nothing is new", () => {
		expect(run()).toMatchObject({ code: 0, out: expect.stringContaining("up to date with origin/main") });
	});

	it("reports what is new with --check and changes nothing", () => {
		release(other, "1.1.0");
		sh(other, "push", "-q");
		const head = sh(clone, "rev-parse", "HEAD");
		const { code, out } = run(true);
		expect(code).toBe(0);
		expect(out).toContain("1 commit(s) behind origin/main");
		expect(out).toContain("release 1.1.0");
		expect(sh(clone, "rev-parse", "HEAD")).toBe(head);
	});

	it("fast-forwards and rebuilds", () => {
		release(other, "1.1.0");
		sh(other, "push", "-q");
		const { code, out } = run();
		expect(code).toBe(0);
		expect(out).toMatch(/updated 1\.0\.0 \([0-9a-f]{7}\) -> 1\.1\.0 \([0-9a-f]{7}\)/);
		const head = sh(clone, "rev-parse", "HEAD");
		expect(head).toBe(sh(other, "rev-parse", "HEAD"));
		expect(buildInfo(clone).commit).toBe(head);
	});

	it("refuses uncommitted or conflicted changes and leaves them alone", () => {
		release(other, "1.1.0");
		sh(other, "push", "-q");
		fs.appendFileSync(path.join(clone, ".gitignore"), "local\n");
		const head = sh(clone, "rev-parse", "HEAD");
		const { code, out } = run();
		expect(code).toBe(1);
		expect(out).toContain("uncommitted or conflicted changes");
		expect(sh(clone, "rev-parse", "HEAD")).toBe(head);
		expect(fs.readFileSync(path.join(clone, ".gitignore"), "utf8")).toContain("local");
	});

	it("refuses to fast-forward over local commits", () => {
		release(other, "1.1.0");
		sh(other, "push", "-q");
		sh(clone, "commit", "-q", "--allow-empty", "-m", "local work");
		const { code, out } = run();
		expect(code).toBe(1);
		expect(out).toContain("cannot fast-forward");
	});

	it("rebuilds a checkout that was pulled without a build", () => {
		release(other, "1.1.0");
		sh(other, "push", "-q");
		sh(clone, "pull", "-q", "--ff-only");
		const { code, out } = run();
		expect(code).toBe(0);
		expect(out).toContain("rebuilt: 1.1.0");
		expect(buildInfo(clone).commit).toBe(sh(clone, "rev-parse", "HEAD"));
	});
});
