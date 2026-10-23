// SPDX-License-Identifier: MIT
// Runs before every test file. Git exports its repo variables to hooks (`git rev-parse --local-env-vars` lists them);
// left in place, a test's temporary repo would run git against the repo that ran the hook. Clear them all.
import { execFileSync } from "node:child_process";

const local = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).split("\n").filter(Boolean);
for (const name of local) delete process.env[name];
