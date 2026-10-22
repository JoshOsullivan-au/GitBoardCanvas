// SPDX-License-Identifier: MIT
/**
 * What ties features together, read from their markdown: a feature depends on another when a line that names it
 * says so (depends on, pointer, build in, needs, after, blocked); every other mention is a link. A feature is
 * gated while it waits on a person: open decisions or unticked Ops actions.
 */

const DEP_LINE =
	/\b(depends? on|dependenc(y|ies)|pointer|blocked|blocker|build in|builds? on|needs?|requires?|prerequisite|after|waits? (on|for)|lands? first|unblocks?)\b/i;
const SETTLED = /\b(settled|decided|resolved|confirmed|closed|withdrawn|built that way|superseded)\b/i;

/** Lines of one `## <heading>` section, up to the next `## `. */
function section(markdown: string, heading: RegExp): string[] {
	const lines = markdown.split("\n");
	const start = lines.findIndex((l) => /^##\s/.test(l) && heading.test(l));
	if (start === -1) return [];
	const out: string[] = [];
	for (const l of lines.slice(start + 1)) {
		if (/^##\s/.test(l)) break;
		out.push(l);
	}
	return out;
}

const TABLE_RULE = /^\|[\s:|-]+\|?\s*$/;

/**
 * Open decisions: each top-level item (`- `, `* `, `1. `) or table data row under "Open decisions" that is not
 * marked settled. Indented lines are the options under an item, not decisions of their own.
 */
export function openDecisions(markdown: string): string[] {
	const lines = section(markdown, /open decisions/i);
	const out: string[] = [];
	lines.forEach((l, i) => {
		const item = /^([-*]|\d+\.)\s+\S/.test(l);
		const row = l.startsWith("|") && !TABLE_RULE.test(l) && !TABLE_RULE.test(lines[i + 1] ?? "");
		if ((item || row) && !SETTLED.test(l)) {
			out.push(
				l
					.replace(/^([-*]|\d+\.)\s+/, "")
					.replace(/^\|\s*|\s*\|\s*$/g, "")
					.replace(/\s*\|\s*/g, " · ")
					.replace(/\*\*/g, "")
					.trim(),
			);
		}
	});
	return out;
}

/** Unticked items under "Ops actions". */
export function openOps(markdown: string): string[] {
	return section(markdown, /ops actions/i)
		.filter((l) => /^\s*[-*]\s+\[ \]/.test(l))
		.map((l) => l.replace(/^\s*[-*]\s+\[ \]\s*/, "").replace(/\*\*/g, "").trim());
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type FeatureText = { id: string; slug: string; stageFolder: string; text: string };

/**
 * Mentions between features. A slug counts when it stands as a path or code token (after `/`, a backtick, `(`,
 * `[` or a space, before `/`, `.`, a backtick, `)` or a space), so prose that happens to share a word does not.
 * When a slug sits in two stages, a mention that names the stage folder picks that one; otherwise the stage that
 * holds the feature folder, else the later stage.
 */
export function findRelations(features: FeatureText[]): Map<string, { deps: string[]; links: string[] }> {
	const bySlug = new Map<string, FeatureText[]>();
	for (const f of features) bySlug.set(f.slug, [...(bySlug.get(f.slug) ?? []), f]);
	const slugs = [...bySlug.keys()].sort((a, b) => b.length - a.length);
	const folders = [...new Set(features.map((f) => f.stageFolder))];
	const out = new Map<string, { deps: string[]; links: string[] }>();
	if (!slugs.length) return out;
	const folderAlt = folders.length ? `(?:(?:${folders.map(escapeRe).join("|")})/)?` : "";
	const re = new RegExp(
		`(?<=^|[\\s/\`(\\[])(${folderAlt})(${slugs.map(escapeRe).join("|")})(?=$|[\\s/.\`)\\]#:,;])`,
		"g",
	);
	const pick = (slug: string, folder: string): FeatureText | undefined => {
		const all = bySlug.get(slug) ?? [];
		return all.find((f) => folder && f.stageFolder === folder.replace(/\/$/, "")) ?? all[all.length - 1];
	};

	for (const f of features) {
		const deps = new Set<string>();
		const links = new Set<string>();
		for (const line of f.text.split("\n")) {
			if (!line.includes("-")) continue;
			const isDep = DEP_LINE.test(line);
			for (const m of line.matchAll(re)) {
				if (m[2] === f.slug) continue;
				const target = pick(m[2], m[1]);
				if (!target || target.id === f.id) continue;
				(isDep ? deps : links).add(target.id);
			}
		}
		for (const d of deps) links.delete(d);
		out.set(f.id, { deps: [...deps].sort(), links: [...links].sort() });
	}
	return out;
}
