// SPDX-License-Identifier: MIT
// Where the board is, as a URL hash: every place in the shell is a link, so back, forward, reload and sharing work.
//   #/roadmap                 the Roadmap
//   #/roadmap?stage=2         the Roadmap, scrolled to stage 2
//   #/roadmap?branch=<name>   the Roadmap, showing the features with work on that branch
//   #/roadmap?need=blocked    the Roadmap with one "Needs you" filter on (blocked, gated, failing, review)
//   #/architecture            the Architecture map
import { useEffect, useState } from "react";

export type ViewName = "roadmap" | "architecture";
export const NEEDS = ["blocked", "gated", "failing", "review"] as const;
export type Need = (typeof NEEDS)[number];
export type Route = { view: ViewName; stage: number | null; branch: string | null; need: Need | null };

const ROADMAP: Route = { view: "roadmap", stage: null, branch: null, need: null };

/** The route a hash names, or null when it names none (an empty or unknown hash). */
export function parseHash(hash: string): Route | null {
	const m = /^#\/(roadmap|architecture)\/?(?:\?(.*))?$/.exec(hash);
	if (!m) return null;
	const view = m[1] as ViewName;
	if (view === "architecture") return { ...ROADMAP, view };
	const q = new URLSearchParams(m[2] ?? "");
	const n = Number(q.get("stage"));
	const stage = Number.isInteger(n) && n > 0 ? n : null;
	const branch = (!stage && q.get("branch")) || null;
	const need = q.get("need");
	// One place at a time, in hashOf's order, so a hand-made hash shows what its link would.
	return { view, stage, branch, need: !stage && !branch && (NEEDS as readonly string[]).includes(need ?? "") ? (need as Need) : null };
}

/** The hash for a route. At most one of stage, branch and need is kept, in that order. */
export function hashOf(r: Partial<Route> & { view: ViewName }): string {
	if (r.view === "architecture") return "#/architecture";
	if (r.stage) return `#/roadmap?stage=${r.stage}`;
	if (r.branch) return `#/roadmap?branch=${encodeURIComponent(r.branch)}`;
	if (r.need) return `#/roadmap?need=${r.need}`;
	return "#/roadmap";
}

/** The current route. A hash that names none is replaced (not pushed) by `fallback`'s. */
export function useRoute(fallback: () => ViewName): Route {
	const read = () => parseHash(location.hash) ?? { ...ROADMAP, view: fallback() };
	const [route, setRoute] = useState<Route>(read);
	useEffect(() => {
		const sync = () => {
			// An in-page anchor (the skip link) is not a place: stay where you are.
			if (location.hash.length > 1 && !location.hash.startsWith("#/")) return;
			const r = read();
			if (!parseHash(location.hash)) history.replaceState(null, "", hashOf(r));
			setRoute(r);
		};
		sync();
		addEventListener("hashchange", sync);
		return () => removeEventListener("hashchange", sync);
	}, []);
	return route;
}

/** Leaves the current place without a history entry: a filter the person cleared, say. */
export function replaceRoute(r: Partial<Route> & { view: ViewName }): void {
	const next = hashOf(r);
	if (location.hash === next) return;
	history.replaceState(null, "", next);
	dispatchEvent(new HashChangeEvent("hashchange"));
}
