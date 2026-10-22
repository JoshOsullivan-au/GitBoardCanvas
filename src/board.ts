// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type GitBoardConfig, groupFor, stagesOf } from "./config.js";
import { boardVersion } from "./git.js";
import { NOT_A_FEATURE } from "./lint.js";
import { attributeGit, type Pipeline, resolveCodeRoots } from "./pipeline.js";
import { type FeatureText, findRelations, openDecisions, openOps } from "./relations.js";
import type { Board, Card, Phase, Stage } from "./types.js";

const PHASE_FILE = /^\d{2}[a-z]?-.+\.md$/;

/** Feature slugs in one stage folder: each `<slug>.md` and `<slug>/`, joined. */
export function stageSlugs(entries: { name: string; dir: boolean }[]): string[] {
	const slugs = new Set<string>();
	for (const e of entries) {
		if (e.name.startsWith(".") || NOT_A_FEATURE.test(e.name)) continue;
		if (e.dir) slugs.add(e.name);
		else if (e.name.endsWith(".md")) slugs.add(e.name.slice(0, -3));
	}
	return [...slugs].sort();
}

function frontmatter(markdown: string): string | null {
	return /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? null;
}

/** Title from front matter `title:` or the first `# ` heading. */
export function titleFrom(markdown: string): string | null {
	const fm = frontmatter(markdown);
	const fmTitle = fm && /^title:\s*(.+)$/m.exec(fm);
	if (fmTitle) return fmTitle[1].trim().replace(/^["']|["']$/g, "");
	const h1 = /^#\s+(.+)$/m.exec(markdown);
	return h1 ? h1[1].trim() : null;
}

/** Front matter `group:`, or null. */
export function groupFrom(markdown: string): string | null {
	const fm = frontmatter(markdown);
	const g = fm && /^group:\s*(.+)$/m.exec(fm);
	return g ? g[1].trim().replace(/^["']|["']$/g, "") || null : null;
}

/** Ticked and open checkboxes in a markdown file. */
export function countTicks(markdown: string): { done: number; total: number; open: string[] } {
	let done = 0;
	const open: string[] = [];
	for (const line of markdown.split("\n")) {
		const m = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
		if (!m) continue;
		if (m[1] === " ") open.push(m[2].replace(/\*\*/g, "").trim());
		else done += 1;
	}
	return { done, total: done + open.length, open };
}

/** A phase file's number and title: `# 01 Schema and access` gives "01" and "Schema and access". */
export function phaseHeading(markdown: string | null, fileName: string): { num: string; title: string } {
	const num = /^(\d{2}[a-z]?)-/.exec(fileName)?.[1] ?? "";
	const heading =
		(markdown ? titleFrom(markdown) : null) ?? slugTitle(fileName.replace(/^\d{2}[a-z]?-/, "").replace(/\.md$/, ""));
	const title = heading.replace(new RegExp(`^(phase\\s+)?${num}[.:)\\s-]*`, "i"), "").trim() || heading;
	return { num, title };
}

function slugTitle(slug: string): string {
	const words = slug.replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function read(file: string): string | null {
	try {
		return fs.readFileSync(file, "utf8");
	} catch {
		return null;
	}
}

function list(dir: string): fs.Dirent[] {
	try {
		return fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
}

/** Every markdown file in a feature folder, depth first, capped so one huge folder cannot stall the board. */
function markdownUnder(dir: string, out: string[] = [], budget = { files: 300 }): string[] {
	for (const e of list(dir)) {
		if (budget.files <= 0) break;
		const p = path.join(dir, e.name);
		if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") markdownUnder(p, out, budget);
		else if (e.isFile() && e.name.endsWith(".md")) {
			budget.files -= 1;
			const body = read(p);
			if (body) out.push(body);
		}
	}
	return out;
}

/** When a file or folder that git has not seen yet was made on disk. */
function birth(p: string): number | null {
	try {
		const st = fs.statSync(p);
		return Math.round(st.birthtimeMs || st.ctimeMs) || null;
	} catch {
		return null;
	}
}

type Touch = { at: number; sha: string };

/**
 * From one `git log` pass over the roadmap on the main branch: the last commit per `<stage>/<slug>`, and the first
 * commit per slug in any stage folder (a feature keeps its created date when it moves between stages).
 */
function lastTouched(root: string, config: GitBoardConfig, created: Map<string, number>): Map<string, Touch> {
	const out = new Map<string, Touch>();
	const depth = config.roadmapDir.split(/[\\/]/).filter(Boolean).length;
	let log: string;
	try {
		log = execFileSync(
			"git",
			["log", config.mainBranch, "--format=@%ct %h", "--name-only", "--", config.roadmapDir],
			{ cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
		);
	} catch {
		return out;
	}
	let at = 0;
	let sha = "";
	for (const line of log.split("\n")) {
		if (line.startsWith("@")) {
			const [t, h] = line.slice(1).split(" ");
			at = Number(t) * 1000;
			sha = h ?? "";
		} else if (line) {
			// Paths come back from the repo root: <roadmapDir>/<stage>/<slug>[.md|/…]
			const parts = line.split("/").slice(depth);
			if (parts.length < 2) continue;
			const slug = parts[1].replace(/\.md$/, "");
			const key = `${parts[0]}/${slug}`;
			if (!out.has(key)) out.set(key, { at, sha });
			// The log runs newest first, so the last time a slug shows up is when it was created.
			created.set(slug, at);
		}
	}
	return out;
}

function readCard(
	roadmap: string,
	roadmapDir: string,
	config: GitBoardConfig,
	stage: Stage,
	slug: string,
	touched: Map<string, Touch>,
	created: Map<string, number>,
): { card: Card; text: string } {
	const stageDir = path.join(roadmap, stage.folder);
	const file = path.join(stageDir, `${slug}.md`);
	const dir = path.join(stageDir, slug);
	const buildList = read(file);
	const readme = read(path.join(dir, "README.md"));
	const checklist = read(path.join(dir, "phases", "checklist.md"));

	let title = (buildList && titleFrom(buildList)) ?? (readme && titleFrom(readme)) ?? null;
	if (!title) {
		const firstMd = list(dir).find((e) => e.isFile() && e.name.endsWith(".md"));
		const body = firstMd ? read(path.join(dir, firstMd.name)) : null;
		title = (body && titleFrom(body)) ?? slugTitle(slug);
	}
	// "my-feature: open items" and "my-feature - completed items" read as their slug.
	if (title.startsWith(slug)) title = slugTitle(slug);

	// One canonical tick source: the build list, else the phase checklist, else the folder README.
	const ticks = countTicks(buildList ?? checklist ?? readme ?? "");

	const phaseDir = list(path.join(dir, "phases")).length ? path.join(dir, "phases") : dir;
	const phaseList: Phase[] = list(phaseDir)
		.filter((e) => e.isFile() && PHASE_FILE.test(e.name))
		.map((e) => e.name)
		.sort()
		.map((name) => {
			const body = read(path.join(phaseDir, name));
			const { num, title: phaseTitle } = phaseHeading(body, name);
			const t = countTicks(body ?? "");
			// Repo-relative, so the server can hand the file back for the preview.
			const rel = path.posix.join(roadmapDir, path.relative(roadmap, path.join(phaseDir, name)).split(path.sep).join("/"));
			return { num, title: phaseTitle, path: rel, done: t.done, total: t.total };
		});

	const own = [buildList ?? "", readme ?? ""].join("\n");
	const landed = touched.get(`${stage.folder}/${slug}`) ?? null;
	const card: Card = {
		id: `${stage.id}:${slug}`,
		slug,
		stage: stage.id,
		title,
		group: groupFor(config, slug, (buildList && groupFrom(buildList)) ?? (readme && groupFrom(readme)) ?? null),
		done: ticks.done,
		total: ticks.total,
		open: ticks.open.slice(0, 40),
		phases: phaseList.length,
		phaseList,
		hasFolder: fs.existsSync(dir),
		hasList: buildList !== null,
		touchedAt: landed?.at ?? null,
		landed,
		createdAt: created.get(slug) ?? birth(buildList !== null ? file : dir),
		git: [],
		decisions: openDecisions(own).slice(0, 20),
		ops: openOps(own).slice(0, 20),
		deps: [],
		links: [],
	};
	return { card, text: [buildList ?? "", ...markdownUnder(dir)].join("\n") };
}

/** Group names in use: configured order first, then any other (from front matter) alphabetically. */
function groupsOf(cards: Card[], config: GitBoardConfig): string[] {
	const used = new Set(cards.map((c) => c.group));
	const known = [...config.groups.map((g) => g.name), config.defaultGroup].filter((g, i, a) => a.indexOf(g) === i);
	return [...known.filter((g) => used.has(g)), ...[...used].filter((g) => !known.includes(g)).sort()];
}

/**
 * Every feature in every stage, newest touch first within a stage. `root` is the repo (main checkout) top; stages,
 * lifecycle folder and main branch come from `config`.
 */
export function loadBoard(root: string, config: GitBoardConfig, opts: { pipeline?: Pipeline | null } = {}): Board {
	const roadmapDir = config.roadmapDir.split(/[\\/]/).filter(Boolean).join("/");
	const roadmap = path.join(root, roadmapDir);
	const stages = stagesOf(config);
	const created = new Map<string, number>();
	const touched = lastTouched(root, config, created);
	const cards: Card[] = [];
	const texts: FeatureText[] = [];
	for (const stage of stages) {
		const entries = list(path.join(roadmap, stage.folder)).map((e) => ({ name: e.name, dir: e.isDirectory() }));
		for (const slug of stageSlugs(entries)) {
			const { card, text } = readCard(roadmap, roadmapDir, config, stage, slug, touched, created);
			cards.push(card);
			texts.push({ id: card.id, slug, stageFolder: stage.folder, text });
		}
	}
	const relations = findRelations(texts);
	for (const c of cards) Object.assign(c, relations.get(c.id) ?? { deps: [], links: [] });
	if (opts.pipeline) {
		const git = attributeGit(opts.pipeline, texts, { roadmapDir, codeRoots: resolveCodeRoots(root, config) });
		for (const c of cards) c.git = git.get(c.id) ?? [];
	}
	cards.sort((a, b) => a.stage - b.stage || (b.touchedAt ?? 0) - (a.touchedAt ?? 0) || a.title.localeCompare(b.title));
	let version: string | null = null;
	try {
		version = boardVersion(root, roadmapDir, config.mainBranch);
	} catch {
		version = null;
	}
	return {
		cards,
		stages,
		groups: groupsOf(cards, config),
		roadmapDir,
		mainBranch: config.mainBranch,
		readAt: Date.now(),
		version,
		github: opts.pipeline ? opts.pipeline.prs !== null : null,
	};
}
