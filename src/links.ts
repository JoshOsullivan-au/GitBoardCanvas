// SPDX-License-Identifier: MIT
import path from "node:path";

import type { PathMove } from "./types.js";

/** Text files whose paths are rewritten when a feature moves. */
export const LINK_FILE = /\.(md|mdc|mdx|txt|ts|tsx|js|jsx|mjs|cjs|json|ya?ml|html)$/i;

/** True when `file` sits under one of the `config.rewriteSkip` prefixes. */
export function isRewriteSkipped(file: string, skip: string[]): boolean {
	return skip.some((prefix) => file.startsWith(prefix));
}

/** Map a repo-relative path through the moves: the moved file or a file inside a moved folder. */
export function mapPath(p: string, moves: PathMove[]): string | null {
	const clean = p.replace(/\/$/, "");
	for (const m of moves) {
		if (clean === m.from) return m.to;
		if (clean.startsWith(`${m.from}/`)) return m.to + clean.slice(m.from.length);
	}
	return null;
}

/** A link destination; one level of balanced parentheses is allowed, as in a Next.js route group `app/(shell)/`. */
export const LINK_DEST = String.raw`(?:[^()\s>]|\([^()\s>]*\))+`;

const MD_LINK = new RegExp(String.raw`(\]\()(<?)(${LINK_DEST})(>?)(\s+"[^"]*")?\)`, "g");

function relLink(fromDir: string, target: string, keepSlash: boolean, hadDot: boolean): string {
	let rel = path.posix.relative(fromDir, target) || ".";
	if (keepSlash && !rel.endsWith("/")) rel += "/";
	if (hadDot && !rel.startsWith(".")) rel = `./${rel}`;
	return rel;
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite one file for a feature move. Markdown links are resolved from the file's old place and written
 * again from its new place, so links into the moved folder and links out of it both stay true. Then bare
 * mentions of `<from stage>/<slug>` (backticks, prose, code comments) become `<to stage>/<slug>`.
 */
export function rewriteFile(
	file: string,
	text: string,
	moves: PathMove[],
	exists: (p: string) => boolean,
	tokens: PathMove[],
): string {
	const newFile = mapPath(file, moves) ?? file;
	const oldDir = path.posix.dirname(file);
	const newDir = path.posix.dirname(newFile);
	let out = text;

	if (/\.(md|mdc|mdx)$/i.test(file)) {
		out = out.replace(MD_LINK, (whole, open: string, lt: string, href: string, gt: string, title = "") => {
			if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return whole;
			const cut = href.search(/[#?]/);
			const target = cut === -1 ? href : href.slice(0, cut);
			const suffix = cut === -1 ? "" : href.slice(cut);
			if (!target) return whole;
			let decoded: string;
			try {
				decoded = decodeURI(target);
			} catch {
				return whole;
			}
			const abs = path.posix.normalize(path.posix.join(oldDir, decoded));
			if (abs.startsWith("..") || !exists(abs.replace(/\/$/, ""))) return whole;
			const absNew = mapPath(abs, moves) ?? abs;
			if (absNew === abs && newDir === oldDir) return whole;
			const rel = relLink(newDir, absNew.replace(/\/$/, ""), target.endsWith("/"), target.startsWith("./"));
			const encoded = target === decoded ? rel : encodeURI(rel);
			return `${open}${lt}${encoded}${suffix}${gt}${title})`;
		});
	}

	for (const t of tokens) {
		const re = new RegExp(`(^|[^\\w.-])${escapeRe(t.from)}(?![A-Za-z0-9_-])`, "g");
		out = out.replace(re, (_m, pre: string) => `${pre}${t.to}`);
	}
	return out;
}
