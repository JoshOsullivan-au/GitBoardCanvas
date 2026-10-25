// SPDX-License-Identifier: MIT
// CHANGELOG.md for releases.
//   node scripts/changelog.mjs release          `npm version` runs this: files Unreleased under the new version
//   node scripts/changelog.mjs notes <version>  prints one version's section, for the GitHub release
import fs from "node:fs";

const file = "CHANGELOG.md";
const text = fs.readFileSync(file, "utf8");
// A Windows checkout may hold CRLF endings: parse on either, and write back with the file's own.
const eol = text.includes("\r\n") ? "\r\n" : "\n";
const [cmd, arg] = process.argv.slice(2);

/** The body under `## <title>` up to the next `## `, or null when there is no such heading. */
function section(title) {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((l) => l === `## ${title}` || l.startsWith(`## ${title} (`));
	if (start < 0) return null;
	const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
	return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

/** True when a section lists at least one change, not only `### Added`-style category headings. */
const hasChanges = (body) => body.split("\n").some((l) => l.trim() !== "" && !l.startsWith("### "));

if (cmd === "release") {
	const version = process.env.npm_package_version;
	if (!version) throw new Error("changelog: run through `npm version`, which sets npm_package_version");
	if (section(version) !== null) throw new Error(`changelog: ${version} already has a section`);
	if (!hasChanges(section("Unreleased") ?? "")) throw new Error("changelog: Unreleased is empty; say what changed before releasing");
	const date = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
	fs.writeFileSync(file, text.replace(/^## Unreleased(?=\r?$)/m, `## Unreleased${eol}${eol}## ${version} (${date})`));
} else if (cmd === "notes" && arg) {
	const body = section(arg.replace(/^v/, ""));
	if (!body) throw new Error(`changelog: no section for ${arg}`);
	process.stdout.write(`${body}\n`);
} else {
	throw new Error("usage: node scripts/changelog.mjs release | notes <version>");
}
