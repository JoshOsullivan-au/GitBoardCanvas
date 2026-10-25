// SPDX-License-Identifier: MIT
// Writes dist/build.json: the version and the commit this dist/ was built from, so `gitboard --version` names the exact
// build and a linked checkout can tell when it was pulled but not rebuilt. Outside a git checkout the commit is null.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
const git = (args) => execFileSync("git", args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let commit = null;
let dirty = false;
try {
	commit = git(["rev-parse", "HEAD"]);
	// Any tracked change or untracked file outside .gitignore: a new source file or a config edit changes the output.
	dirty = git(["status", "--porcelain", "--untracked-files=normal"]) !== "";
} catch {
	// Not a git checkout (a packed tarball): the version alone names the build.
}

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
fs.writeFileSync("dist/build.json", `${JSON.stringify({ version, commit, dirty, builtAt: new Date().toISOString() }, null, "\t")}\n`);
