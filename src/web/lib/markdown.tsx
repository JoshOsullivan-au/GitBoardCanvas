// SPDX-License-Identifier: MIT
// A markdown file the server rendered, shown in a dialog: task boxes as Phosphor glyphs, outside links in a new tab,
// in-page anchors scroll, and a repo link goes to `onLink` with its path resolved against `path`.
import { type MouseEvent, useLayoutEffect, useRef } from "react";

import { iconSvg } from "./icon";

/** `href` resolved against the folder of the repo-relative file `fromFile`; a folder link means its README. */
/** A link off the board: http(s) or protocol-relative. It opens in a new tab. */
const OUTSIDE = /^(?:https?:)?\/\//i;
/** A link the browser handles itself. */
const MAIL = /^mailto:/i;
/** Any other scheme (javascript:, data: and the like): Marked does not sanitise links, so these never run. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function resolveRel(fromFile: string, href: string): string {
	let target = href.split("#")[0];
	try {
		target = decodeURI(target);
	} catch {
		/* a stray % stays as written */
	}
	if (target.endsWith("/")) target += "README.md";
	const parts = fromFile.split("/");
	parts.pop();
	for (const seg of target.split("/")) {
		if (seg === "." || seg === "") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return parts.join("/");
}

export function Markdown({ html, path, onLink, onShown }: { html: string; path: string; onLink: (next: string) => void; onShown?: () => void }) {
	const article = useRef<HTMLElement>(null);
	useLayoutEffect(() => {
		const md = article.current!;
		md.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => {
			const mark = document.createElement("span");
			mark.className = `tick${box.checked ? " on" : ""}`;
			mark.setAttribute("role", "img");
			mark.setAttribute("aria-label", box.checked ? "Done" : "Not done");
			mark.innerHTML = iconSvg(box.checked ? "CheckSquare" : "Square");
			box.replaceWith(mark);
		});
		md.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
			if (OUTSIDE.test(a.getAttribute("href")!)) {
				a.target = "_blank";
				a.rel = "noopener noreferrer";
			}
		});
		onShown?.();
		// onShown is a focus hand-off for this html; a new callback alone is not a new document.
	}, [html]);
	const onClick = (e: MouseEvent<HTMLElement>) => {
		const a = (e.target as Element).closest("a[href]");
		if (!a) return;
		const href = a.getAttribute("href")!;
		if (OUTSIDE.test(href) || MAIL.test(href)) return;
		e.preventDefault();
		if (SCHEME.test(href)) return;
		if (href.startsWith("#")) {
			article.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
			return;
		}
		onLink(resolveRel(path, href));
	};
	/* The server renders the markdown with raw HTML escaped (R11). */
	return <article className="md" tabIndex={0} ref={article} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
