// SPDX-License-Identifier: MIT
// The board page: a dashboard shell. The sidebar says where you are (views, stages, work in flight, what needs you,
// docs); the top bar says what you can do here (menus and the view's search); the inset panel holds the view's header
// and the Roadmap board, or the Architecture map when gitboard.config.json has an architecture block.
import { type MouseEvent, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppSidebar, type Doc, type Second, secondOf } from "./components/shell/AppSidebar";
import { useDocDialog } from "./components/shell/DocDialog";
import { TopBar } from "./components/shell/TopBar";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Architecture, type ArchitectureStatus } from "./architecture/Architecture";
import { api } from "./lib/api";
import { architectureOn, repoName } from "./lib/boot";
import { replaceRoute, useRoute, type ViewName } from "./lib/hash";
import { navOf } from "./lib/nav";
import { loadText, save } from "./lib/storage";
import { PageProvider } from "./lib/ui";
import { Roadmap, type RoadmapStatus } from "./roadmap/Roadmap";

/* The map needs its width: the sidebar opens expanded on the Roadmap and as icons on Architecture. After that each
   view keeps the person's own toggle. */
const SIDEBAR_KEY: Record<ViewName, string> = { roadmap: "gitboard-sidebar-roadmap", architecture: "gitboard-sidebar-architecture" };
const sidebarOpen = (v: ViewName) => {
	const saved = loadText(SIDEBAR_KEY[v]);
	return saved ? saved === "expanded" : v === "roadmap";
};

function useTheme() {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
	const toggle = () => {
		document.documentElement.classList.toggle("dark", !dark);
		save("gitboard-theme", dark ? "light" : "dark");
		setDark(!dark);
	};
	return { dark, toggle };
}

/** Marks a board's scroll area once it leaves the top, so its sticky column headers turn more opaque (board.css). Set on
 * the element, not in state: scrolling never re-renders the board. */
const markScrolled = (e: UIEvent<HTMLDivElement>) => e.currentTarget.toggleAttribute("data-scrolled", e.currentTarget.scrollTop > 0);

function Shell() {
	const arch = architectureOn();
	/* Roadmap is the default; with no place in the URL, the view a viewer last chose. */
	const route = useRoute(() => (arch && loadText("gitboard-tab") === "architecture" ? "architecture" : "roadmap"));
	const view: ViewName = arch ? route.view : "roadmap";
	useEffect(() => save("gitboard-tab", view), [view]);
	useEffect(() => {
		if (view !== route.view) replaceRoute({ view });
	}, [view, route.view]);

	/* The second bar (Work in flight or Needs you) opens beside the main bar, which shrinks to icons while it is open.
	   A branch or "Needs you" place opens its bar. */
	const [second, setSecond] = useState<Second | null>(() => secondOf(route));
	const placeSecond = secondOf(route);
	/* Set when the person picks a row in the second bar: that place is reached from the bar, which then closes. */
	const rowPicked = useRef(false);
	useEffect(() => {
		if (!placeSecond) return;
		if (rowPicked.current) {
			rowPicked.current = false;
			return;
		}
		setSecond(placeSecond);
		setOpen(false);
	}, [placeSecond]);
	const onSecond = (s: Second | null) => {
		setSecond(s);
		if (s) setOpen(false);
	};
	/* A branch or filter picked in the second bar: the bar closes, the main bar stays shrunk, the place opens. A branch
	   also opens its lead feature's details. */
	const [show, setShow] = useState<{ id: string; n: number } | null>(null);
	const onRow = (s: Second, feature?: string) => {
		if (feature) setShow((prev) => ({ id: feature, n: (prev?.n ?? 0) + 1 }));
		setSecond(null);
		setOpen(false);
		if (s !== placeSecond) rowPicked.current = true;
		if (view !== "roadmap") picked.current = true;
	};

	const [open, setOpen] = useState(() => !secondOf(route) && sidebarOpen(view));
	/* Picking Roadmap or Architecture in the sidebar folds it to icons, closes the second bar and opens the view; reaching
	   a view any other way (reload, back, the breadcrumb) gives it its own remembered toggle, unless a second bar is open.
	   None of these changes what is remembered. */
	const picked = useRef(false);
	useEffect(() => {
		setOpen(picked.current || second ? false : sidebarOpen(view));
		picked.current = false;
		// Only a change of view applies the remembered toggle; the second bar is read as it stands.
	}, [view]);
	const onPick = (to: ViewName) => {
		setSecond(null);
		if (to === view) setOpen(false);
		else picked.current = true;
	};
	/* The person's own toggle: remembered for this view; expanding the main bar closes the second one. */
	const onOpenChange = (o: boolean) => {
		setOpen(o);
		if (o) setSecond(null);
		save(SIDEBAR_KEY[view], o ? "expanded" : "icons");
	};

	const [roadmap, setRoadmap] = useState<RoadmapStatus>({ model: null, readAt: null, failed: false });
	const [map, setMap] = useState<ArchitectureStatus>({ pages: null });
	const onRoadmap = useCallback((s: RoadmapStatus) => setRoadmap(s), []);
	const onMap = useCallback((s: ArchitectureStatus) => setMap(s), []);
	const nav = useMemo(() => (roadmap.model ? navOf(roadmap.model) : null), [roadmap.model]);

	const [docs, setDocs] = useState<Doc[]>([]);
	useEffect(() => {
		api<{ docs: Doc[] }>("/api/docs")
			.then((r) => setDocs(r.docs))
			.catch(() => setDocs([]));
	}, []);
	const roadmapDir = roadmap.model?.roadmapDir ?? null;
	const guide = docs.find((d) => roadmapDir && d.path === `${roadmapDir}/README.md`) ?? null;
	const { openDoc, dialog } = useDocDialog(roadmapDir, docs);

	const theme = useTheme();
	const [roadmapSearch, setRoadmapSearch] = useState<HTMLDivElement | null>(null);
	const [archSearch, setArchSearch] = useState<HTMLDivElement | null>(null);
	const [roadmapTools, setRoadmapTools] = useState<HTMLDivElement | null>(null);
	const [archTools, setArchTools] = useState<HTMLDivElement | null>(null);

	const fact = view === "roadmap" ? (nav ? `${nav.features === 1 ? "1 feature" : `${nav.features} features`} in ${nav.stages.length} stages` : "") : map.pages ? `${map.pages === 1 ? "1 page" : `${map.pages} pages`} measured` : "";

	return (
		<SidebarProvider
			className="app-shell"
			open={open}
			onOpenChange={onOpenChange}
		>
			<a
				className="skip"
				href="#content"
				onClick={(e: MouseEvent<HTMLAnchorElement>) => {
					e.preventDefault();
					document.getElementById("content")?.focus();
				}}
			>
				Skip to the board
			</a>
			<AppSidebar
				repo={repoName()}
				mainBranch={roadmap.model?.mainBranch ?? null}
				route={{ ...route, view }}
				nav={nav}
				arch={arch}
				archPages={map.pages}
				docs={docs}
				openDoc={openDoc}
				status={{ readAt: roadmap.readAt, failed: roadmap.failed, github: roadmap.model?.github ?? null }}
				dark={theme.dark}
				toggleTheme={theme.toggle}
				onPick={onPick}
				second={second}
				onSecond={onSecond}
				onRow={onRow}
			/>
			<SidebarInset className="app-inset" id="content" tabIndex={-1}>
				<TopBar
					route={{ ...route, view }}
					nav={nav}
					guide={guide}
					openDoc={openDoc}
					search={
						<>
							<div className="tb-slot" hidden={view !== "roadmap"} ref={setRoadmapSearch}></div>
							{arch ? <div className="tb-slot" hidden={view !== "architecture"} ref={setArchSearch}></div> : null}
						</>
					}
				/>
				<div className="vh">
					<div className="vh-left">
						<h1>{view === "roadmap" ? "Roadmap" : "Architecture"}</h1>
						<span className="vh-fact">{fact}</span>
					</div>
					<div className="tools" data-view="roadmap" hidden={view !== "roadmap"} ref={setRoadmapTools}></div>
					{arch ? <div className="tools" data-view="architecture" hidden={view !== "architecture"} ref={setArchTools}></div> : null}
				</div>
				<div className="scroll" id="scroll" hidden={view !== "roadmap"} onScroll={markScrolled}>
					<Roadmap tools={roadmapTools} search={roadmapSearch} route={route} onStatus={onRoadmap} show={show} />
				</div>
				{arch ? (
					<div className="scroll" id="archScroll" hidden={view !== "architecture"} onScroll={markScrolled}>
						<Architecture active={view === "architecture"} tools={archTools} search={archSearch} onStatus={onMap} />
					</div>
				) : null}
			</SidebarInset>
			{dialog}
		</SidebarProvider>
	);
}

export function App() {
	return (
		<PageProvider>
			<TooltipProvider>
				<Shell />
			</TooltipProvider>
		</PageProvider>
	);
}
