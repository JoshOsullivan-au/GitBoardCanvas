// SPDX-License-Identifier: MIT
// The board shell: an inset sidebar that says where you are (the views) and a slim top bar that says what you can do
// here (the view's tools). Built from shadcn/ui's Sidebar on Base UI; Tailwind scans this folder only (ADR 0004).
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { Icon } from "@/lib/icon";
import { loadSidebar, saveSidebar, sidebarOpen, type View, viewHref, VIEWS } from "@/lib/shell";
import { save } from "@/lib/storage";
import { Separator } from "@/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

function ThemeButton() {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
	const label = dark ? "Light theme" : "Dark theme";
	return (
		<SidebarMenuButton
			id="theme"
			tooltip={label}
			onClick={() => {
				document.documentElement.classList.toggle("dark", !dark);
				save("gitboard-theme", dark ? "light" : "dark");
				setDark(!dark);
			}}
		>
			<Icon name={dark ? "Sun" : "Moon"} />
			<span>{label}</span>
		</SidebarMenuButton>
	);
}

/** Tells the board's link routers the content width changed: they redraw on window resize. */
function useResizeSignal() {
	const ref = useRef<HTMLElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		let frame = 0;
		let width = el.getBoundingClientRect().width;
		const ro = new ResizeObserver(() => {
			const w = el.getBoundingClientRect().width;
			if (w === width) return;
			width = w;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => dispatchEvent(new Event("resize")));
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(frame);
		};
	}, []);
	return ref;
}

/** The sidebar: where you are. On a phone it is a sheet, which closes when a link is chosen, the current view too. */
function AppSidebar({ view, arch }: { view: View; arch: boolean }) {
	const { setOpenMobile } = useSidebar();
	const close = () => setOpenMobile(false);
	const views = VIEWS.filter((v) => arch || v.view === "roadmap");
	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" tooltip="GitBoard Canvas" onClick={close} render={<a href={viewHref("roadmap")} />}>
							<span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
								G
							</span>
							<span className="font-semibold">GitBoard Canvas</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Board</SidebarGroupLabel>
					<SidebarMenu aria-label="Views">
						{views.map((v) => (
							<SidebarMenuItem key={v.view}>
								<SidebarMenuButton
									isActive={view === v.view}
									tooltip={v.label}
									data-view={v.view}
									aria-current={view === v.view ? "page" : undefined}
									onClick={close}
									render={<a href={viewHref(v.view)} />}
								>
									<Icon name={v.icon} />
									<span>{v.label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<ThemeButton />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

export function Shell({ view, arch, tools, children }: { view: View; arch: boolean; tools: ReactNode; children: ReactNode }) {
	const [chosen, setChosen] = useState(loadSidebar);
	const inset = useResizeSignal();
	const title = VIEWS.find((v) => v.view === view)?.label;
	return (
		<TooltipProvider>
			<SidebarProvider
				className="h-svh min-h-0 overflow-hidden"
				style={{ "--sidebar-width": "15rem" } as CSSProperties}
				open={sidebarOpen(view, chosen)}
				onOpenChange={(open) => {
					setChosen(open);
					saveSidebar(open);
				}}
			>
				<AppSidebar view={view} arch={arch} />
				<SidebarInset ref={inset} className="min-h-0 min-w-0 overflow-hidden">
					<header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
						<SidebarTrigger className="-ml-1 shrink-0" />
						<Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-center" />
						<h1 className="text-sm font-medium whitespace-nowrap">{title}</h1>
						<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">{tools}</div>
					</header>
					{children}
				</SidebarInset>
			</SidebarProvider>
		</TooltipProvider>
	);
}
