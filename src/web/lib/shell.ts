// SPDX-License-Identifier: MIT
// The shell's routes and sidebar rules: each view has a hash URL (#/roadmap, #/architecture), so back, forward and
// reload keep the view, and the sidebar opens per view until the viewer toggles it.
import { useEffect, useState } from "react";

import { loadText, save } from "./storage";

export type View = "roadmap" | "architecture";

export const VIEWS: { view: View; label: string; icon: string }[] = [
	{ view: "roadmap", label: "Roadmap", icon: "Stack" },
	{ view: "architecture", label: "Architecture", icon: "Cube" },
];

export const viewHref = (view: View): string => `#/${view}`;

/** The view a hash names, or null for a hash that is not a route (a heading anchor in a doc, say). */
export function parseView(hash: string, arch: boolean): View | null {
	const m = /^#\/([a-z]+)(?:[/?].*)?$/.exec(hash);
	if (!m) return null;
	if (m[1] === "roadmap") return "roadmap";
	if (m[1] === "architecture") return arch ? "architecture" : "roadmap";
	return "roadmap";
}

/** The view to show: the hash's, else the one the viewer last chose, else the Roadmap. */
export function startView(hash: string, arch: boolean, last: string | null): View {
	return parseView(hash, arch) ?? (arch && last === "architecture" ? "architecture" : "roadmap");
}

/**
 * The current view, following the hash, remembered as the viewer's last choice. A page opened with no route gets its
 * start view written into the URL, so Back to it finds a route. A hash that is not a route leaves the view as it is.
 */
export function useView(arch: boolean): View {
	const [view, setView] = useState<View>(() => startView(location.hash, arch, loadText("gitboard-tab")));
	useEffect(() => {
		if (!parseView(location.hash, arch)) history.replaceState(history.state, "", viewHref(view));
		// A view opened by its URL counts as the viewer's choice, as one opened from the sidebar does.
		save("gitboard-tab", view);
		// Once, on load: later hashes that are not routes are anchors, not a missing route.
	}, []);
	useEffect(() => {
		const follow = () => {
			const next = parseView(location.hash, arch);
			if (!next) return;
			setView(next);
			save("gitboard-tab", next);
		};
		addEventListener("hashchange", follow);
		return () => removeEventListener("hashchange", follow);
	}, [arch]);
	return view;
}

/**
 * Whether the sidebar is expanded. Until the viewer toggles it, it opens on the Roadmap and folds to icons on
 * Architecture, whose 1,284 px map does not fit beside the expanded sidebar at 1440 wide. After a toggle, the viewer's
 * choice holds for both views.
 */
export const sidebarOpen = (view: View, chosen: boolean | null): boolean => chosen ?? view === "roadmap";

const SIDEBAR_KEY = "gitboard-sidebar";

export function loadSidebar(): boolean | null {
	const saved = loadText(SIDEBAR_KEY);
	return saved === "expanded" ? true : saved === "collapsed" ? false : null;
}

export const saveSidebar = (open: boolean): void => save(SIDEBAR_KEY, open ? "expanded" : "collapsed");
