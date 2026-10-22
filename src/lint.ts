// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";

import type { GitBoardConfig } from "./config.js";
import { LINK_DEST } from "./links.js";

const PHASE_FILE = /^\d{2}[a-z]?-[a-z0-9][a-z0-9-]*\.md$/i;
/** Feature slugs: letters, digits, `-` and `_`. */
export const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** Stage-level files that are not features. Board and lint both use this. */
export const NOT_A_FEATURE = /^(readme|context|agents|claude)(\.md)?$/i;

function entries(dir: string): fs.Dirent[] {
	try {
		return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => !d.name.startsWith("."));
	} catch {
		return [];
	}
}

function walkMarkdown(dir: string, out: string[] = []): string[] {
	for (const d of entries(dir)) {
		const p = path.join(dir, d.name);
		if (d.isDirectory()) walkMarkdown(p, out);
		else if (/\.md$/i.test(d.name)) out.push(p);
	}
	return out;
}

function headingsOf(text: string): Set<string> {
	return new Set(
		text
			.split("\n")
			.filter((l) => /^## /.test(l))
			.map((l) => l.trim()),
	);
}

function missingHeadings(file: string, required: string[]): string[] {
	const have = headingsOf(fs.readFileSync(file, "utf8"));
	return required.map((h) => (h.startsWith("## ") ? h : `## ${h}`)).filter((h) => !have.has(h));
}

/** Built-in structure checks L1 to L6 (spec 2.6), run against the tree at `root`. `<roadmapDir>/templates/` is never checked. */
export function runLint(root: string, config: GitBoardConfig): { ok: boolean; problems: string[] } {
	const problems: string[] = [];
	const base = path.join(root, config.roadmapDir);
	const owners = new Map<string, string[]>();

	for (const stage of config.stages) {
		const dir = path.join(base, stage.folder);
		// L1
		if (!fs.existsSync(dir)) {
			problems.push(`L1: stage folder ${config.roadmapDir}/${stage.folder} is missing`);
			continue;
		}
		const slugs = new Set<string>();
		for (const d of entries(dir)) {
			if (NOT_A_FEATURE.test(d.name)) continue;
			if (d.isDirectory()) slugs.add(d.name);
			else if (/\.md$/i.test(d.name)) slugs.add(d.name.replace(/\.md$/i, ""));
		}
		for (const slug of slugs) {
			owners.set(slug, [...(owners.get(slug) ?? []), stage.folder]);
			// L6
			if (!SLUG_RE.test(slug)) problems.push(`L6: ${config.roadmapDir}/${stage.folder}/${slug} is not a valid slug (letters, digits, - and _ only)`);
		}

		for (const d of entries(dir)) {
			if (!d.isDirectory()) continue;
			const feature = path.join(dir, d.name);
			const rel = `${config.roadmapDir}/${stage.folder}/${d.name}`;
			// L4, L5 (phase files)
			for (const f of entries(path.join(feature, "phases"))) {
				if (!f.isFile() || !/\.md$/i.test(f.name) || f.name.toLowerCase() === "checklist.md") continue;
				if (!PHASE_FILE.test(f.name)) problems.push(`L4: ${rel}/phases/${f.name} is not named NN-slug.md`);
				else if (config.lint.phaseHeadings.length) {
					const missing = missingHeadings(path.join(feature, "phases", f.name), config.lint.phaseHeadings);
					if (missing.length) problems.push(`L5: ${rel}/phases/${f.name} lacks ${missing.join(", ")}`);
				}
			}
			// L5 (README sections)
			const readme = path.join(feature, "README.md");
			if (config.lint.readmeSections.length && fs.existsSync(readme)) {
				const missing = missingHeadings(readme, config.lint.readmeSections);
				if (missing.length) problems.push(`L5: ${rel}/README.md lacks ${missing.join(", ")}`);
			}
		}
	}

	// L2
	for (const [slug, folders] of owners) {
		if (folders.length > 1) problems.push(`L2: ${slug} sits in ${folders.join(" and ")}`);
	}

	// L3
	const templates = path.join(base, "templates");
	for (const file of walkMarkdown(base)) {
		if (file.startsWith(templates + path.sep)) continue;
		const text = fs.readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
		for (const m of text.matchAll(new RegExp(String.raw`\]\(<?(${LINK_DEST})>?(?:\s+"[^"]*")?\)`, "g"))) {
			const href = m[1] ?? "";
			if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue;
			const target = href.split(/[#?]/)[0] ?? "";
			if (!target) continue;
			let decoded = target;
			try {
				decoded = decodeURI(target);
			} catch {
				/* keep raw */
			}
			if (!fs.existsSync(path.resolve(path.dirname(file), decoded))) {
				problems.push(`L3: ${path.relative(root, file).split(path.sep).join("/")} links to missing ${href}`);
			}
		}
	}

	return { ok: problems.length === 0, problems };
}
