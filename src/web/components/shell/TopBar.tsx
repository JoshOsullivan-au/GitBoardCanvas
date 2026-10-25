// SPDX-License-Identifier: MIT
// The top bar: what you can do here. The sidebar toggle, where you are as a breadcrumb, the Lifecycle and Help menus
// (destinations with a line of description each), and the current view's search: `search` holds the views' slots.
import { Fragment, type ReactNode } from "react";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { hashOf, type Route } from "@/lib/hash";
import { Icon } from "@/lib/icon";
import type { Nav } from "@/lib/nav";

import type { Doc } from "./AppSidebar";

const DOCS_URL = "https://github.com/JoshOsullivan-au/GitBoardCanvas";

/** GitBoard's own help: README sections, each with what it answers. */
export const HELP: { label: string; href: string; text: string }[] = [
	{ label: "Commands", href: `${DOCS_URL}#commands`, text: "Serve, move, lint, list, init and measure, with exit codes." },
	{ label: "For coding agents", href: `${DOCS_URL}#for-coding-agents`, text: "How an agent moves features and reads the board." },
	{ label: "Configuration", href: `${DOCS_URL}/blob/main/docs/configuration.md`, text: "Every key in gitboard.config.json, and hook recipes." },
	{ label: "Security", href: `${DOCS_URL}#security`, text: "What the board listens on, and what it never sends." },
];

const NEED_LABEL = { blocked: "Blocked", gated: "Gated", failing: "Checks failing", review: "Needs review" };

/** The crumbs after "GitBoard": the view, then the stage, branch or filter the sidebar opened. */
function crumbs(route: Route, nav: Nav | null): { label: string; href?: string }[] {
	if (route.view === "architecture") return [{ label: "Architecture" }];
	const place = route.stage ? (nav?.stages.find((s) => s.id === route.stage)?.name ?? `Stage ${route.stage}`) : route.branch ? route.branch : route.need ? NEED_LABEL[route.need] : null;
	return place ? [{ label: "Roadmap", href: hashOf({ view: "roadmap" }) }, { label: place }] : [{ label: "Roadmap" }];
}

export function TopBar({ route, nav, guide, openDoc, search }: { route: Route; nav: Nav | null; guide: Doc | null; openDoc: (d: Doc) => void; search: ReactNode }) {
	const trail = crumbs(route, nav);
	return (
		<header className="tb">
			<SidebarTrigger className="-ml-1" />
			<Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
			<Breadcrumb className="tb-crumbs">
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href={hashOf({ view: "roadmap" })}>GitBoard</BreadcrumbLink>
					</BreadcrumbItem>
					{trail.map((c, i) => (
						<Fragment key={i}>
							<BreadcrumbSeparator />
							<BreadcrumbItem>{c.href ? <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}</BreadcrumbItem>
						</Fragment>
					))}
				</BreadcrumbList>
			</Breadcrumb>
			<NavigationMenu align="end" className="tb-nav">
				<NavigationMenuList>
					<NavigationMenuItem>
						<NavigationMenuTrigger disabled={!nav}>Lifecycle</NavigationMenuTrigger>
						<NavigationMenuContent>
							<ul className="grid w-72 gap-1 p-1">
								{(nav?.stages ?? []).map((s) => (
									<li key={s.id}>
										<NavigationMenuLink render={<a href={hashOf({ view: "roadmap", stage: s.id })} />} className="flex-col items-start gap-0.5">
											<span className="font-medium">
												{s.id} {s.name}
											</span>
											<span className="text-xs text-muted-foreground">{s.count === 1 ? "1 feature" : `${s.count} features`}</span>
										</NavigationMenuLink>
									</li>
								))}
								{guide ? (
									<li>
										<NavigationMenuLink render={<button type="button" onClick={() => openDoc(guide)} />} className="w-full flex-col items-start gap-0.5 text-left">
											<span className="font-medium">Lifecycle guide</span>
											<span className="text-xs text-muted-foreground">Each stage and the gate to leave it.</span>
										</NavigationMenuLink>
									</li>
								) : null}
							</ul>
						</NavigationMenuContent>
					</NavigationMenuItem>
					<NavigationMenuItem>
						<NavigationMenuTrigger>Help</NavigationMenuTrigger>
						<NavigationMenuContent>
							<ul className="grid w-80 gap-1 p-1">
								{HELP.map((h) => (
									<li key={h.label}>
										<NavigationMenuLink render={<a href={h.href} target="_blank" rel="noopener noreferrer" />} className="flex-col items-start gap-0.5">
											<span className="flex items-center gap-1.5 font-medium">
												{h.label}
												<Icon name="ArrowSquareOut" className="size-3 text-muted-foreground" />
											</span>
											<span className="text-xs text-muted-foreground">{h.text}</span>
										</NavigationMenuLink>
									</li>
								))}
							</ul>
						</NavigationMenuContent>
					</NavigationMenuItem>
				</NavigationMenuList>
			</NavigationMenu>
			<div className="tb-search">{search}</div>
		</header>
	);
}
