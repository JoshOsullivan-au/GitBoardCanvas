// SPDX-License-Identifier: MIT
// The sidebar: where you are, in shadcn's sidebar layout. The main bar holds the repo; Roadmap with Work in flight and
// Needs you under it; Architecture; and at its foot the docs, the theme and the board's read status. Picking Work in
// flight or Needs you shrinks the main bar to icons and opens a second bar beside it with that list: each branch with
// work, or the features that need a person. Every item is a link (lib/hash) with its count; a zero shows no count.
import type { ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";
import { hashOf, type Route } from "@/lib/hash";
import { Icon } from "@/lib/icon";
import type { Nav } from "@/lib/nav";

export type Doc = { label: string; path: string };

/** The footer's status: when git was last read, whether the server stopped answering, and GitHub's state. */
export type ReadStatus = { readAt: number | null; failed: boolean; github: boolean | null };

/** What the second bar lists. */
export type Second = "flight" | "needs";

/** The second bar a place belongs to: a branch is work in flight, a filter is what needs you. */
export const secondOf = (r: Route): Second | null => (r.branch ? "flight" : r.need ? "needs" : null);

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const tip = (label: string, n: number | null | undefined, one: string, many?: string) => (n ? `${label} · ${count(n, one, many)}` : label);

/** One place: Roadmap or Architecture, with what sits under it. Picking it folds the sidebar and opens the view (App's
 * onPick). */
function Place({
	href,
	icon,
	label,
	n,
	active,
	tooltip,
	onPick,
	children,
}: {
	href: string;
	icon: string;
	label: string;
	n: number | null | undefined;
	active: boolean;
	tooltip: string;
	onPick: () => void;
	children?: ReactNode;
}) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton render={<a href={href} aria-current={active ? "page" : undefined} />} isActive={active} tooltip={tooltip} onClick={onPick}>
				<Icon name={icon} />
				<span>{label}</span>
			</SidebarMenuButton>
			{n ? <SidebarMenuBadge>{n}</SidebarMenuBadge> : null}
			{children ? <SidebarMenuSub>{children}</SidebarMenuSub> : null}
		</SidebarMenuItem>
	);
}

/** Work in flight or Needs you under Roadmap: opens the second bar. Folded to icons, it stands as an icon of its own. */
function Opener({ second, icon, label, n, title, open, onSecond, icons }: { second: Second; icon: string; label: string; n: number | null; title: string; open: boolean; onSecond: (s: Second) => void; icons: boolean }) {
	if (icons)
		return (
			<SidebarMenuItem>
				<SidebarMenuButton isActive={open} aria-expanded={open} tooltip={title} onClick={() => onSecond(second)}>
					<Icon name={icon} />
					<span>{label}</span>
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	return (
		<SidebarMenuSubItem>
			<SidebarMenuSubButton render={<button type="button" aria-expanded={open} title={title} />} isActive={open} className="w-full" onClick={() => onSecond(second)}>
				<span>{label}</span>
				{n ? <span className="sb-n">{n}</span> : null}
				<Icon name="CaretRight" className="sb-caret" />
			</SidebarMenuSubButton>
		</SidebarMenuSubItem>
	);
}

/** One row in the second bar: a branch, or a "Needs you" filter. Picking it closes the bar (App's onRow). */
function Row({ href, icon, label, n, active, title, tone, onPick }: { href: string; icon: string; label: string; n: number; active: boolean; title?: string; tone?: "att"; onPick: () => void }) {
	return (
		<SidebarMenuItem>
			<SidebarMenuButton render={<a href={href} aria-current={active ? "page" : undefined} title={title} />} isActive={active} className={tone === "att" ? "sb-att" : undefined} onClick={onPick}>
				<Icon name={icon} />
				<span>{label}</span>
			</SidebarMenuButton>
			{n ? <SidebarMenuBadge>{n}</SidebarMenuBadge> : null}
		</SidebarMenuItem>
	);
}

function Waiting({ loading, children }: { loading: boolean; children: ReactNode }) {
	if (loading)
		return (
			<>
				{[0, 1, 2, 3, 4].map((i) => (
					<SidebarMenuItem key={i}>
						<SidebarMenuSkeleton />
					</SidebarMenuItem>
				))}
			</>
		);
	return <p className="sb-empty">{children}</p>;
}

/** The second bar: the list Work in flight or Needs you opened, beside the main bar. */
function SecondBar({ second, nav, route, loading, onClose, onRow }: { second: Second; nav: Nav | null; route: Route; loading: boolean; onClose: () => void; onRow: (target: Pick<Route, "branch" | "need">, feature?: string) => void }) {
	const onRoadmap = route.view === "roadmap";
	const flight = second === "flight";
	const title = flight ? "Work in flight" : "Needs you";
	const fact = nav ? (flight ? count(nav.branches.length, "branch", "branches") : nav.attention ? count(nav.attention, "feature") : "") : "";
	return (
		<Sidebar collapsible="none" className="sb-second" role="region" aria-label={title}>
			<SidebarHeader className="sb-second-head">
				<div>
					<b>{title}</b>
					<span>{fact}</span>
				</div>
				<button type="button" className="icon-btn" aria-label={`Close ${title}`} onClick={onClose}>
					<Icon name="X" />
				</button>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						{flight ? (
							nav?.branches.length ? (
								nav.branches.map((b) => (
									<Row
										key={b.branch}
										href={hashOf({ view: "roadmap", branch: b.branch })}
										icon={b.pr ? "GitPullRequest" : "GitBranch"}
										label={b.branch}
										n={b.files}
										active={onRoadmap && route.branch === b.branch}
										tone={b.pr?.worst?.attn ? "att" : undefined}
										title={[b.branch, b.files ? count(b.files, "file") : null, b.pr ? `PR #${b.pr.number}${b.pr.worst ? `: ${b.pr.worst.text}` : ""}` : null].filter(Boolean).join(" · ")}
										onPick={() => onRow({ branch: b.branch, need: null }, b.lead)}
									/>
								))
							) : (
								<Waiting loading={loading}>No branch has work in flight.</Waiting>
							)
						) : nav?.needs.length ? (
							nav.needs.map((x) => (
								<Row
									key={x.need}
									href={hashOf({ view: "roadmap", need: x.need })}
									icon={x.icon}
									label={x.label}
									n={x.count}
									active={onRoadmap && route.need === x.need}
									tone={x.need === "failing" ? "att" : undefined}
									onPick={() => onRow({ branch: null, need: x.need })}
								/>
							))
						) : (
							<Waiting loading={loading}>Nothing needs you.</Waiting>
						)}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}

export function AppSidebar({
	repo,
	mainBranch,
	route,
	nav,
	arch,
	archPages,
	docs,
	openDoc,
	status,
	dark,
	toggleTheme,
	onPick,
	second,
	onSecond,
	onRow,
}: {
	repo: string;
	mainBranch: string | null;
	route: Route;
	/** Null until the first read of the board. */
	nav: Nav | null;
	arch: boolean;
	archPages: number | null;
	docs: Doc[];
	openDoc: (d: Doc) => void;
	status: ReadStatus;
	dark: boolean;
	toggleTheme: () => void;
	/** Roadmap or Architecture was picked: the shell folds the sidebar as the view opens. */
	onPick: (view: "roadmap" | "architecture") => void;
	/** The second bar that is open, if any. */
	second: Second | null;
	/** Work in flight or Needs you was picked: the shell opens (or closes) that second bar and shrinks the main one. */
	onSecond: (s: Second | null) => void;
	/** A row in the second bar was picked: the shell closes the bar as the place opens, and for a branch opens its lead
	 * feature's details. */
	onRow: (target: Pick<Route, "branch" | "need">, feature?: string) => void;
}) {
	const { state, isMobile, setOpenMobile } = useSidebar();
	const icons = state === "collapsed" && !isMobile;
	const onRoadmap = route.view === "roadmap";
	const loading = !nav && !status.failed;
	const read = status.readAt ? hhmm(status.readAt) : null;
	const readText = status.failed ? (read ? `Not read since ${read}` : "Not read yet") : read ? `Read ${read}` : "Reading";
	/* On a phone the sidebar is a sheet over the board: going somewhere closes it. */
	const closeOnLink = (e: { target: EventTarget }) => isMobile && (e.target as Element).closest("a[href]") && setOpenMobile(false);
	const toggle = (s: Second) => onSecond(second === s ? null : s);
	const openers = (
		<>
			<Opener
				second="flight"
				icon="GitBranch"
				label="Work in flight"
				n={nav?.branches.length ?? null}
				title={tip("Work in flight", nav?.branches.length, "branch", "branches")}
				open={second === "flight"}
				onSecond={toggle}
				icons={icons}
			/>
			<Opener
				second="needs"
				icon="HourglassMedium"
				label="Needs you"
				n={nav?.attention ?? null}
				title={tip("Needs you", nav?.attention, "feature")}
				open={second === "needs"}
				onSecond={toggle}
				icons={icons}
			/>
		</>
	);

	return (
		<>
			<Sidebar variant="inset" collapsible="icon">
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							{/* The repo; no menu until the board reads more than one (multi-repo-board). */}
							<SidebarMenuButton size="lg" render={<div />} tooltip={mainBranch ? `${repo} · ${mainBranch}` : repo} className="sb-repo">
								<span className="sb-mark" aria-hidden="true">
									{([...repo][0] ?? "").toUpperCase()}
								</span>
								<span className="sb-name">
									<b>{repo}</b>
									<span>{mainBranch ?? ""}</span>
								</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent onClick={closeOnLink}>
					<nav aria-label="Board" style={{ display: "contents" }}>
						<SidebarGroup>
							<SidebarGroupLabel>Board</SidebarGroupLabel>
							<SidebarMenu>
								<Place
									href={hashOf({ view: "roadmap" })}
									icon="Kanban"
									label="Roadmap"
									n={nav?.features}
									active={onRoadmap && !route.branch && !route.need}
									tooltip={tip("Roadmap", nav?.features, "feature")}
									onPick={() => onPick("roadmap")}
								>
									{icons ? null : openers}
								</Place>
								{/* Folded, the sub-items would hide: they stand as icons under Roadmap instead. */}
								{icons ? openers : null}
								{arch ? (
									<Place
										href={hashOf({ view: "architecture" })}
										icon="TreeStructure"
										label="Architecture"
										n={archPages}
										active={route.view === "architecture"}
										tooltip={tip("Architecture", archPages, "page")}
										onPick={() => onPick("architecture")}
									/>
								) : null}
							</SidebarMenu>
						</SidebarGroup>
					</nav>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						{docs.length ? (
							<SidebarMenuItem>
								<DropdownMenu>
									<DropdownMenuTrigger render={<SidebarMenuButton tooltip="Docs" />}>
										<Icon name="BookOpen" />
										<span>Docs</span>
									</DropdownMenuTrigger>
									<DropdownMenuContent side="right" align="end" className="min-w-48">
										<DropdownMenuLabel>Docs</DropdownMenuLabel>
										{docs.map((d) => (
											<DropdownMenuItem key={d.path} onClick={() => openDoc(d)}>
												<Icon name="FileText" />
												{d.label}
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</SidebarMenuItem>
						) : null}
						<SidebarMenuItem>
							<SidebarMenuButton id="theme" onClick={toggleTheme} tooltip={dark ? "Light theme" : "Dark theme"} aria-label="Switch theme">
								<Icon name={dark ? "Sun" : "Moon"} />
								<span>{dark ? "Light theme" : "Dark theme"}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton render={<div role="status" />} tooltip={readText} className={`sb-status${status.failed ? " sb-att" : ""}`} id="readStatus">
								<Icon name={status.failed ? "Warning" : "CheckCircle"} />
								<span>{readText}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
						{status.github === false ? (
							<SidebarMenuItem>
								<SidebarMenuButton render={<div />} tooltip="GitHub Missing: pull requests are not read" className="sb-status" id="githubStatus">
									<Icon name="GitPullRequest" />
									<span>GitHub Missing</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						) : null}
					</SidebarMenu>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
			{second && !isMobile ? <SecondBar second={second} nav={nav} route={route} loading={loading} onClose={() => onSecond(null)} onRow={onRow} /> : null}
		</>
	);
}
