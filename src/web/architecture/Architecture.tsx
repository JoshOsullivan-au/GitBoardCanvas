// SPDX-License-Identifier: MIT
// The Architecture tab: every route the host serves, on the path request, pages, database, cache and providers, each
// with its warm server time against the budget, its calls and their waves (data: gitboard measure). Hover a route to
// trace its calls; click a card for its read path.
import { type ChangeEvent, type CSSProperties, memo, type MouseEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ArchitectureMap, Sample } from "../../architecture/measure.js";
import type { Call, TargetInfo } from "../../architecture/readPath.js";
import { ddmmyyyy, hhmm, plural, secs } from "../lib/format";
import { hasIcon, Icon } from "../lib/icon";
import { drawRoutes } from "../lib/routes";
import { load, save } from "../lib/storage";
import { Modal, type ModalHandle } from "../lib/ui";

type Node = Omit<Partial<Sample>, "sample" | "warm" | "calls" | "waves" | "databaseCalls"> & {
	key: string;
	route: string;
	area: string;
	file: string;
	label: string;
	sample: string | null;
	warm: Sample["warm"];
	calls: Call[];
	waves: number;
	databaseCalls: number;
	noRequest?: string | null;
	avgMs: number | null;
	count: number;
};
type Endpoint = { endpoint: string; target: string; routes: Set<string>; shell: boolean; calls: number; totalMs: number };
type Built = { map: ArchitectureMap; nodes: Node[]; endpoints: Map<string, Endpoint> };

/* Areas, access endpoints, provider names, call targets and the cache come from the host's gitboard.config.json,
   through the data. A target says which column its calls land in (database, cache or provider), their group, label and
   icon; a call whose target the data does not describe is a provider. */
const KIND_ICON: Record<string, string> = { database: "Database", cache: "Stack", provider: "Plug" };
const OTHER: TargetInfo = { kind: "provider", group: "Providers", label: "Provider", icon: null, prefix: "" };

function build(map: ArchitectureMap): Built {
	const nodes: Node[] = [];
	const endpoints = new Map<string, Endpoint>();
	const shell = new Set(map.shell);
	for (const r of map.routes) {
		const many = r.samples.length > 1;
		if (!r.samples.length) {
			nodes.push({ key: r.route, route: r.route, area: r.area, file: r.file, label: r.route, sample: null, warm: null, calls: [], waves: 0, databaseCalls: 0, noRequest: r.noRequest, avgMs: r.avgMs, count: r.count });
		}
		for (const s of r.samples) {
			const label = many ? `${r.route} · ${s.sample.split("/")[2] ?? s.sample}` : r.route;
			const node: Node = { route: r.route, area: r.area, file: r.file, label, ...s, key: `${r.route}|${s.sample}`, avgMs: r.avgMs, count: r.count };
			nodes.push(node);
			for (const c of s.calls) {
				const e = endpoints.get(c.endpoint) ?? { endpoint: c.endpoint, target: c.target, routes: new Set<string>(), shell: shell.has(c.endpoint), calls: 0, totalMs: 0 };
				e.routes.add(node.key);
				e.calls += 1;
				e.totalMs += c.durMs;
				endpoints.set(c.endpoint, e);
			}
		}
	}
	return { map, nodes, endpoints };
}

/** Lookups over one measure: icons, labels and columns for its targets. */
function lookups(map: ArchitectureMap) {
	const areaIcons = Object.fromEntries(map.areas.filter((a) => a.icon).map((a) => [a.name, a.icon]));
	const access = new Set(map.access ?? []);
	const providers = map.providers ?? {};
	const targets = map.targets ?? {};
	const info = (target: string) => (Object.hasOwn(targets, target) ? targets[target] : OTHER);
	const kindOf = (target: string) => info(target).kind;
	const targetIcon = (target: string) => {
		const ic = info(target).icon;
		return hasIcon(ic) ? ic : (KIND_ICON[kindOf(target)] ?? "Plug");
	};
	return {
		access,
		targets,
		info,
		kindOf,
		targetIcon,
		areaIcon: (area: string) => (hasIcon(areaIcons[area]) ? (areaIcons[area] as string) : "Stack"),
		epLabel: (e: Pick<Endpoint, "endpoint" | "target">) => {
			const host = e.endpoint.split(" ")[0];
			const { prefix } = info(e.target);
			return providers[host] ? `${providers[host]} ${e.endpoint.slice(host.length + 1)}` : prefix && e.endpoint.startsWith(prefix) ? e.endpoint.slice(prefix.length) : e.endpoint;
		},
		epKind: (e: Pick<Endpoint, "target">) => info(e.target).label,
		epIcon: (endpoint: string, target: string) => (access.has(endpoint) ? "ShieldCheck" : targetIcon(target)),
	};
}
type Lookups = ReturnType<typeof lookups>;

const tone = (map: ArchitectureMap, n: Node) => (!n.warm ? "none" : n.warm.serverMs <= map.budgetMs ? "ok" : n.warm.serverMs <= 2 * map.budgetMs ? "over" : "far");
const avgOf = (e: Endpoint) => Math.round(e.totalMs / Math.max(1, e.calls));
const ORDER: Record<string, (a: Node, b: Node) => number> = {
	slow: (a, b) => (b.warm?.serverMs ?? -1) - (a.warm?.serverMs ?? -1),
	calls: (a, b) => b.databaseCalls - a.databaseCalls || ORDER.slow(a, b),
	waves: (a, b) => b.waves - a.waves || ORDER.slow(a, b),
	title: (a, b) => a.label.localeCompare(b.label),
};

/* ---- cards ---- */
function RouteCard({ b, n, trace }: { b: Built; n: Node; trace: string | null }) {
	const L = lookups(b.map);
	const t = tone(b.map, n);
	const on = trace === n.key;
	const dim = Boolean(trace) && !on;
	const sub = n.warm
		? `${plural(n.databaseCalls, "database call")} · ${plural(n.waves, "wave")}${n.status && n.status >= 300 && n.status < 400 ? ` · ${n.status}` : ""}`
		: (n.noRequest ?? "No request in the window");
	return (
		<div
			className={`card lg lg-regular ${t === "ok" ? "done" : t === "none" ? "lock" : t}${on ? " on" : ""}${dim ? " off" : ""}`}
			data-key={n.key}
			role="button"
			tabIndex={0}
			aria-label={`${n.label}, ${n.warm ? secs(n.warm.serverMs) : "no request"}, ${sub}`}
		>
			<span className="chips">
				{n.warm ? (
					<span className={`av-b tn ${t}`} title="Warm server time">
						<Icon name="Timer" />
						<span className="t">{secs(n.warm.serverMs)}</span>
					</span>
				) : (
					<span className="av-b dt">No request</span>
				)}
			</span>
			<span className="tile">
				<Icon name={L.areaIcon(n.area)} />
			</span>
			<span className="tx">
				<b>{n.label}</b>
				<span>{sub}</span>
			</span>
			<span className="st">{t === "ok" ? <Icon name="Check" /> : null}</span>
		</div>
	);
}

function EpCard({ L, e, used }: { L: Lookups; e: Endpoint; used: Set<string> | null }) {
	const dim = used && !used.has(e.endpoint);
	const on = used?.has(e.endpoint);
	return (
		<div
			className={`card ep lg lg-regular${e.shell ? " shell" : ""}${L.access.has(e.endpoint) ? " access" : ""}${on ? " on" : ""}${dim ? " off" : ""}`}
			data-ep={e.endpoint}
			role="button"
			tabIndex={0}
			aria-label={`${e.endpoint}, ${e.routes.size} routes, average ${avgOf(e)} ms`}
		>
			<span className="tile">
				<Icon name={L.epIcon(e.endpoint, e.target)} />
			</span>
			<span className="tx">
				<b>{L.epLabel(e)}</b>
				<span>
					{plural(e.routes.size, "route")} · {plural(e.calls, "call")} · {avgOf(e)} ms avg
				</span>
			</span>
			<span className="st"></span>
		</div>
	);
}

function FixedCard({ id, icon, title, sub, open }: { id: string; icon: string; title: string; sub: string; open?: string }) {
	return (
		<div className="card lg lg-regular" data-fixed={id} data-open={open} role={open ? "button" : undefined} tabIndex={open ? 0 : undefined}>
			<span className="tile">
				<Icon name={icon} />
			</span>
			<span className="tx">
				<b>{title}</b>
				<span>{sub}</span>
			</span>
			<span className="st">{open ? <Icon name="CaretRight" /> : null}</span>
		</div>
	);
}

/* `id` keeps a built-in group's collapse state apart from a configured group with the same heading. */
function Group({ col, name, icon, count, id = name, collapsed, children }: { col: string; name: string; icon: string; count: number; id?: string; collapsed: Set<string>; children: ReactNode }) {
	const key = `${col}|${id}`;
	const open = !collapsed.has(key);
	return (
		<div className={`grp${count ? "" : " empty"}`} data-collapsed={open ? undefined : ""} data-key={key}>
			<button type="button" className="gh" data-group={key} aria-expanded={open}>
				<span className="car">
					<Icon name="CaretRight" />
				</span>
				<span className="gi">
					<Icon name={icon} />
				</span>
				<span className="gn">{name}</span>
				<span className="pill">{count}</span>
			</button>
			<div className="gb">
				<div className="inner">
					<div className="cell">{children}</div>
				</div>
			</div>
		</div>
	);
}

function Column({ id, sn, name, count, now, children }: { id: string; sn: number; name: string; count: number; now?: boolean; children: ReactNode }) {
	return (
		<section className={`fwcol lg lg-clear${now ? " now" : ""}`} data-col={id} aria-label={`${sn} ${name}`}>
			<header className="fwsh lg lg-regular">
				<div className="t">
					<span className="sn">{sn}</span>
					{name}
				</div>
				<span className="cnt">{count}</span>
			</header>
			{children}
		</section>
	);
}

/* The database, cache and provider groups. Database and provider calls group by their target's group, in the order
   the config's rules name them; providers end with the group of calls no rule describes. Empty groups are dropped, but
   a column with no provider call still shows that last group, empty. The cache column has one group, its cache. */
type EpGroup = [name: string, icon: string, list: Endpoint[], id?: string];
function epGroups(b: Built, L: Lookups, matches: (e: Endpoint) => boolean) {
	const groupNames = (kind: string) => {
		const out = new Map<string, string>();
		for (const [id, t] of Object.entries(L.targets)) if (t.kind === kind && !out.has(t.group)) out.set(t.group, L.targetIcon(id));
		if (kind === "provider" && !out.has(OTHER.group)) out.set(OTHER.group, KIND_ICON.provider);
		return [...out];
	};
	const all = [...b.endpoints.values()].filter(matches);
	const sort = (list: Endpoint[]) => list.sort((a, c) => c.routes.size - a.routes.size || a.endpoint.localeCompare(c.endpoint));
	const grouped = (kind: string, list: Endpoint[]): EpGroup[] => groupNames(kind).map(([name, ic]) => [name, ic, sort(list.filter((e) => L.info(e.target).group === name))]);
	const database = all.filter((e) => L.kindOf(e.target) === "database");
	const providers = grouped("provider", all.filter((e) => L.kindOf(e.target) === "provider"));
	return {
		database: (
			[
				["Shell", "Stack", sort(database.filter((e) => e.shell)), ":shell"],
				["Access checks", "ShieldCheck", sort(all.filter((e) => !e.shell && L.access.has(e.endpoint))), ":access"],
				...grouped("database", database.filter((e) => !e.shell && !L.access.has(e.endpoint))),
			] as EpGroup[]
		).filter(([, , list]) => list.length),
		providers: providers.some(([, , list]) => list.length) ? providers.filter(([, , list]) => list.length) : providers.filter(([name]) => name === OTHER.group),
		cache: sort(all.filter((e) => L.kindOf(e.target) === "cache")),
	};
}

/* ---- read path column widths, kept per viewer ---- */
type Col = "label" | "ms";
const COL_LIMITS: Record<Col, [number, number]> = { label: [120, 560], ms: [44, 160] };
const clampWidth = (col: Col, px: number) => Math.round(Math.min(COL_LIMITS[col][1], Math.max(COL_LIMITS[col][0], px)));

type Row = { num?: string; icon?: string; name: string; start: number; dur: number; cls?: string; open?: Record<string, string> };

/* A timeline list: GitBoard's phase list, one row per call, all rows on one time scale with the budget marked. */
function Timeline({ rows, total, budgetMs, widths, setWidth }: { rows: Row[]; total: number; budgetMs: number; widths: Record<Col, number>; setWidth: (col: Col, px: number, keep?: boolean) => void }) {
	const wf = useRef<HTMLDivElement>(null);
	const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / total) * 100))}%`;
	const step = total > 3000 ? 1000 : total > 1200 ? 250 : 100;
	const ticks: number[] = [];
	for (let t = 0; t <= total; t += step) ticks.push(t);
	const grip = (col: Col) => {
		const sign = col === "label" ? 1 : -1; // the time column grows leftwards
		return (
			<span
				key={col}
				className="col-grip"
				data-col={col}
				role="separator"
				aria-orientation="vertical"
				aria-label={`${col === "label" ? "Name" : "Time"} column width`}
				aria-valuemin={COL_LIMITS[col][0]}
				aria-valuemax={COL_LIMITS[col][1]}
				aria-valuenow={widths[col]}
				tabIndex={0}
				onPointerDown={(e) => {
					e.preventDefault();
					const g = e.currentTarget;
					g.setPointerCapture(e.pointerId);
					const x0 = e.clientX,
						w0 = widths[col];
					g.dataset.drag = "";
					wf.current!.dataset.dragging = "";
					let last = w0;
					const move = (ev: globalThis.PointerEvent) => {
						last = w0 + sign * (ev.clientX - x0);
						setWidth(col, last);
					};
					const up = () => {
						delete g.dataset.drag;
						delete wf.current?.dataset.dragging;
						g.removeEventListener("pointermove", move);
						setWidth(col, last, true);
					};
					g.addEventListener("pointermove", move);
					g.addEventListener("pointerup", up, { once: true });
					g.addEventListener("pointercancel", up, { once: true });
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
					e.preventDefault();
					setWidth(col, widths[col] + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 64 : 16) * sign, true);
				}}
				onDoubleClick={
					col === "label"
						? () => {
								const labels = [...wf.current!.querySelectorAll(".phase .lbl")];
								const widest = Math.max(
									...labels.map((l) => [...l.children].reduce((w, c) => w + (c.classList.contains("pt") ? c.scrollWidth : c.getBoundingClientRect().width) + 8, 0)),
								);
								setWidth(col, widest, true);
							}
						: undefined
				}
			></span>
		);
	};
	return (
		<div className="wf" ref={wf} style={{ "--wf-label": `${widths.label}px`, "--wf-ms": `${widths.ms}px` } as CSSProperties}>
			{grip("label")}
			{grip("ms")}
			<div className="axis">
				<span></span>
				<span className="ticks">
					{ticks.map((t) => (
						<span key={t} style={{ left: pct(t) }}>
							{t >= 1000 ? `${t / 1000} s` : t}
						</span>
					))}
				</span>
				<span></span>
			</div>
			<ul className="phase-list">
				{rows.map((r, i) => {
					const inner = (
						<>
							<span className="lbl">
								{r.num ? <span className="num">{r.num}</span> : null}
								{r.icon ? <Icon name={r.icon} /> : null}
								<span className="pt" title={r.name}>
									{r.name}
								</span>
							</span>
							<span className="tl">
								<span className="budget" style={{ left: pct(budgetMs) }}></span>
								<i style={{ left: pct(r.start), width: pct(r.dur) }}></i>
							</span>
							<span className="pf">{r.dur} ms</span>
						</>
					);
					return (
						<li key={i}>
							{r.open ? (
								<button type="button" {...r.open} className={`phase ${r.cls ?? ""}`}>
									{inner}
								</button>
							) : (
								<div className={`phase ${r.cls ?? ""} plain`}>{inner}</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}

/* ---- details: a route's read path, an endpoint's callers, the shell, the cache; Back returns ---- */
type DView = { kind: "route" | "ep"; id: string } | { kind: "shell" | "cache" };

function viewTitle(b: Built, L: Lookups, v: DView): string {
	if (v.kind === "route") return b.nodes.find((x) => x.key === v.id)?.label ?? "";
	if (v.kind === "ep") {
		const e = b.endpoints.get(v.id);
		return e ? L.epLabel(e) : "";
	}
	if (v.kind === "shell") return "Shell";
	return b.map.cache?.name ?? "Cache";
}

function DetailsBody({ b, L, v, timeline }: { b: Built; L: Lookups; v: DView; timeline: (rows: Row[], total: number) => ReactNode }) {
	const { map } = b;
	if (v.kind === "route") {
		const n = b.nodes.find((x) => x.key === v.id);
		if (!n) return null;
		if (!n.warm) {
			return (
				<>
					<h2 id="ad-title">{n.label}</h2>
					<div className="sub">
						{n.area} · {n.file}
					</div>
					<p>{n.noRequest}</p>
				</>
			);
		}
		const t = tone(map, n);
		const total = Math.max(n.warm.serverMs, map.budgetMs, ...n.calls.map((c) => c.startMs + c.durMs));
		const byWave = (a: Call, c: Call) => a.wave - c.wave || a.startMs - c.startMs;
		const row = (c: Call): Row => ({
			num: `W${c.wave}`,
			icon: L.epIcon(c.endpoint, c.target),
			name: c.endpoint,
			start: c.startMs,
			dur: c.durMs,
			cls: `o-${c.origin}${L.kindOf(c.target) === "provider" ? " o-provider" : ""}`,
			open: { "data-ep": c.endpoint },
		});
		const shell = n.calls.filter((c) => c.origin === "shell").sort(byWave).map(row);
		const page = n.calls.filter((c) => c.origin === "page").sort(byWave).map(row);
		const fixed: Row[] = [{ icon: "Cloud", name: "Server request", start: 0, dur: n.warm.serverMs, cls: "server" }];
		if (n.warm.middlewareMs != null) fixed.push({ icon: "ShieldCheck", name: "Proxy", start: 0, dur: n.warm.middlewareMs, cls: "server" });
		return (
			<>
				<h2 id="ad-title">{n.label}</h2>
				<div className="sub">
					{n.area} · {n.sample}
					{n.status ? ` · HTTP ${n.status}` : ""}
				</div>
				<div className="figure-row">
					<span className="figure">{secs(n.warm.serverMs)}</span>
					<span className={`meter bud ${t}`}>
						<i style={{ width: `${Math.min(100, (n.warm.serverMs / (2 * map.budgetMs)) * 100)}%` }}></i>
					</span>
					<span className="phases">
						{plural(n.databaseCalls, "database call")} · {plural(n.waves, "wave")}
					</span>
				</div>
				<section className="ps">
					<h5>
						<Icon name="Timer" />
						Server
					</h5>
					{timeline(fixed, total)}
				</section>
				<section className="ps">
					<h5>
						<Icon name="Stack" />
						Shell · {shell.length}
					</h5>
					{shell.length ? timeline(shell, total) : <div className="gnote">No shell calls</div>}
				</section>
				<section className="ps">
					<h5>
						<Icon name={L.areaIcon(n.area)} />
						Page · {page.length}
					</h5>
					{page.length ? timeline(page, total) : <div className="gnote">No page calls</div>}
				</section>
				<div className="gnote">
					Cold {n.cold ? secs(n.cold.serverMs) : "Missing"} · avg {n.avgMs != null ? secs(n.avgMs) : "Missing"} over {n.count} · trace {n.warm.traceId} · {n.file}
				</div>
			</>
		);
	}
	if (v.kind === "ep") {
		const e = b.endpoints.get(v.id);
		if (!e) return null;
		const hits = b.nodes
			.flatMap((n) => n.calls.filter((c) => c.endpoint === v.id).map((c) => ({ n, c })))
			// Slowest route first; a route that calls it more than once keeps its calls together, in start order.
			.sort((a, c) => (c.n.warm?.serverMs ?? 0) - (a.n.warm?.serverMs ?? 0) || a.n.key.localeCompare(c.n.key) || a.c.startMs - c.c.startMs);
		const total = Math.max(map.budgetMs, ...hits.map(({ c }) => c.startMs + c.durMs));
		const rows = hits.map(({ n, c }) => ({
			num: `W${c.wave}`,
			icon: L.areaIcon(n.area),
			name: n.label,
			start: c.startMs,
			dur: c.durMs,
			cls: `o-${c.origin}${L.kindOf(c.target) === "provider" ? " o-provider" : ""}`,
			open: { "data-key": n.key },
		}));
		return (
			<>
				<h2 id="ad-title">{L.epLabel(e)}</h2>
				<div className="sub">
					{L.epKind(e)}
					{e.shell ? " · Shell" : ""}
					{L.access.has(v.id) ? " · access" : ""} · {v.id}
				</div>
				<div className="figure-row">
					<span className="figure">{avgOf(e)} ms</span>
					<span className="phases">
						avg per call · {plural(e.calls, "call")} on {plural(e.routes.size, "route")}
					</span>
				</div>
				<section className="ps">
					<h5>
						<Icon name="Timer" />
						When each route calls it
					</h5>
					{timeline(rows, total)}
				</section>
			</>
		);
	}
	if (v.kind === "shell") {
		const list = [...b.endpoints.values()].filter((e) => e.shell).sort((a, c) => avgOf(c) - avgOf(a));
		return (
			<>
				<h2 id="ad-title">Shell</h2>
				<div className="sub">Layout calls, on every page that makes calls</div>
				<section className="ps">
					<h5>
						<Icon name="Stack" />
						Calls
					</h5>
					<ul className="rel">
						{list.map((e) => (
							<li key={e.endpoint}>
								<button type="button" className="relr" data-ep={e.endpoint}>
									<span className="tile">
										<Icon name={L.epIcon(e.endpoint, e.target)} />
									</span>
									<span className="tx">
										<b>{L.epLabel(e)}</b>
										<span>
											{L.epKind(e)} · {avgOf(e)} ms avg · {plural(e.routes.size, "route")}
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			</>
		);
	}
	const cache = map.cache ?? { name: "Cache", reader: "", readers: [] };
	return (
		<>
			<h2 id="ad-title">{cache.name}</h2>
			<div className="sub">{cache.reader}</div>
			<p>No cache call on any request in this window.</p>
			{cache.readers.length ? (
				<section className="ps">
					<h5>
						<Icon name="Database" />
						Read through {cache.reader} in
					</h5>
					<ul className="open">
						{cache.readers.map((f) => (
							<li key={f}>
								<Icon name="Stack" />
								<span>{f}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</>
	);
}

type SavedView = { order: string; collapsed: string[] };

/** What the shell shows of the map: how many pages it measured, or null while there is no measure to draw. */
export type ArchitectureStatus = { pages: number | null };

function ArchitectureView({
	active,
	tools,
	search,
	onStatus,
}: {
	active: boolean;
	tools: HTMLElement | null;
	search: HTMLElement | null;
	onStatus: (s: ArchitectureStatus) => void;
}) {
	const [built, setBuilt] = useState<Built | null>(null);
	/* Why the tab has nothing to draw: the server's reason (no measure yet, a file that is not a measure), or no answer. */
	const [problem, setProblem] = useState<string | null>(null);
	const [saved] = useState(() => load<SavedView>("gitboard-architecture-view"));
	const [order, setOrder] = useState(saved.order ?? "slow");
	const [collapsed, setCollapsed] = useState(() => new Set(saved.collapsed ?? []));
	const [q, setQ] = useState("");
	const [trace, setTrace] = useState<string | null>(null);
	const [widths, setWidths] = useState<Record<Col, number>>(() => ({ label: 220, ms: 56, ...load<Record<Col, number>>("gitboard-architecture-cols") }));
	const [trail, setTrail] = useState<DView[]>([]);
	const [open, setOpen] = useState(false);
	const boardEl = useRef<HTMLDivElement>(null);
	const modal = useRef<ModalHandle>(null);

	const persist = (next: Partial<SavedView>) => save("gitboard-architecture-view", { order: next.order ?? order, collapsed: next.collapsed ?? [...collapsed] });

	/* Read the measure once for the sidebar's count, and again each time the map shows. */
	const shown = useRef(false);
	useEffect(() => {
		if (!active && shown.current) return;
		shown.current = true;
		let live = true;
		(async () => {
			const res = await fetch("/api/architecture", { cache: "no-store" }).catch(() => null);
			const body = await res?.json().catch(() => null);
			if (!live) return;
			if (!res?.ok) {
				setProblem(body?.error ?? "The board server did not answer.");
				return;
			}
			try {
				setBuilt(build(body as ArchitectureMap));
				setProblem(null);
			} catch {
				setBuilt(null);
				setProblem("The measure file is not one this version reads: run gitboard measure again.");
			}
		})();
		return () => {
			live = false;
		};
	}, [active]);

	const L = useMemo(() => (built ? lookups(built.map) : null), [built]);
	useEffect(() => onStatus({ pages: built && !problem ? built.map.routes.length : null }), [built, problem, onStatus]);

	/* Links from a traced route to every endpoint it calls, drawn by the board's own router. The page's own calls are
	   solid with an arrowhead (blk), the shell's calls dotted (lnk). */
	const links = useCallback(() => {
		const cols = boardEl.current?.querySelector(".fwcols");
		const n = built?.nodes.find((x) => x.key === trace);
		const colEls = cols ? [...cols.querySelectorAll(".fwcol")] : [];
		const end = (el: Element | null | undefined) => ({ el, col: colEls.indexOf(el?.closest(".fwcol") as Element) });
		const from = n && cols?.querySelector(`.card[data-key="${CSS.escape(n.key)}"]`);
		drawRoutes(
			cols,
			!from || !n
				? []
				: [...new Set(n.calls.map((c) => c.endpoint))].map((ep) => {
						const shell = built!.endpoints.get(ep)?.shell;
						return { from: end(from), to: end(cols!.querySelector(`.card[data-ep="${CSS.escape(ep)}"]`)), cls: shell ? "lnk" : "blk", arrow: !shell };
					}),
		);
	}, [built, trace]);
	useLayoutEffect(() => links());
	useEffect(() => {
		const ro = new ResizeObserver(() => links());
		if (boardEl.current) ro.observe(boardEl.current);
		return () => ro.disconnect();
	}, [links]);

	const openDetails = (v: DView, push = true) => {
		if (push) setTrail((t) => [...(open ? t : []), v]);
		setOpen(true);
	};
	const activate = (el: HTMLElement) => {
		if (el.dataset.key) openDetails({ kind: "route", id: el.dataset.key });
		else if (el.dataset.ep) openDetails({ kind: "ep", id: el.dataset.ep });
		else if (el.dataset.open) openDetails({ kind: el.dataset.open as "shell" | "cache" });
	};
	const setWidth = (col: Col, px: number, keep = false) =>
		setWidths((w) => {
			const next = { ...w, [col]: clampWidth(col, px) };
			if (keep) save("gitboard-architecture-cols", next);
			return next;
		});

	/* ---- board ---- */
	let surface: ReactNode;
	if (problem || !built || !L) surface = <p className="gnote">{problem ?? "No measure yet: run gitboard measure --from <iso>."}</p>;
	else {
		const { map, nodes } = built;
		const s = q.toLowerCase();
		const routeMatches = (n: Node) => !s || n.label.toLowerCase().includes(s) || n.calls.some((c) => c.endpoint.toLowerCase().includes(s));
		const epMatches = (e: Endpoint) => !s || e.endpoint.toLowerCase().includes(s) || [...e.routes].some((k) => k.toLowerCase().includes(s));
		const tr = nodes.find((n) => n.key === trace);
		const used = tr ? new Set(tr.calls.map((c) => c.endpoint)) : null;
		const shown = nodes.filter(routeMatches).sort(ORDER[order] ?? ORDER.slow);
		const proxy = nodes.filter((n) => n.warm?.middlewareMs != null).map((n) => n.warm!.middlewareMs as number);
		const g = epGroups(built, L, epMatches);
		const shellCount = new Set(map.shell).size;
		const routeCount = new Set(nodes.map((n) => n.route)).size;
		const ep = (e: Endpoint) => <EpCard key={e.endpoint} L={L} e={e} used={used} />;
		const cacheName = map.cache?.name ?? Object.values(L.targets).find((t) => t.kind === "cache")?.group ?? "Cache";
		const providerCount = g.providers.reduce((n, [, , l]) => n + l.length, 0);
		surface = (
			<div className={`fwcols${tr ? " tracing" : ""}`} style={{ "--cols": 4 } as CSSProperties}>
				<svg className="fwlinks" aria-hidden="true"></svg>
				<Column id="request" sn={1} name="Request" count={3}>
					<Group col="request" name="Browser" icon="Globe" count={1} collapsed={collapsed}>
						<FixedCard id="browser" icon="Globe" title="HTTPS GET" sub="Signed-in Person, session cookie" />
					</Group>
					<Group col="request" name={map.platform?.server ?? "Server"} icon="Cloud" count={2} collapsed={collapsed}>
						<FixedCard id="proxy" icon="ShieldCheck" title="Proxy" sub={`Before every page · ${proxy.length ? `${Math.max(...proxy)} ms at most` : "Missing"}`} />
						<FixedCard id="shell" icon="Stack" title="Shell" sub={`Layout · ${plural(shellCount, "call")} per page`} open="shell" />
					</Group>
				</Column>
				<Column id="pages" sn={2} name="Pages" count={routeCount} now>
					{map.areas.map(({ name: area }) => {
						const list = shown.filter((n) => n.area === area);
						return list.length ? (
							<Group key={area} col="pages" name={area} icon={L.areaIcon(area)} count={list.length} collapsed={collapsed}>
								{list.map((n) => (
									<RouteCard key={n.key} b={built} n={n} trace={trace} />
								))}
							</Group>
						) : null;
					})}
				</Column>
				<Column id="database" sn={3} name={map.platform?.database ?? "Database"} count={g.database.reduce((n, [, , l]) => n + l.length, 0)}>
					{g.database.map(([name, ic, list, id]) => (
						<Group key={id ?? name} col="database" name={name} icon={ic} count={list.length} id={id} collapsed={collapsed}>
							{list.map(ep)}
						</Group>
					))}
				</Column>
				<Column id="out" sn={4} name={map.cache ? "Cache and providers" : "Providers"} count={g.cache.length + providerCount + (map.cache && !g.cache.length ? 1 : 0)}>
					{map.cache || g.cache.length ? (
						<Group col="out" name={cacheName} icon="Stack" count={g.cache.length || 1} id=":cache" collapsed={collapsed}>
							{g.cache.length ? g.cache.map(ep) : <FixedCard id="cache" icon="Stack" title={cacheName} sub="No call in this window" open="cache" />}
						</Group>
					) : null}
					{g.providers.map(([name, ic, list]) => (
						<Group key={name} col="out" name={name} icon={ic} count={list.length} collapsed={collapsed}>
							{list.map(ep)}
						</Group>
					))}
				</Column>
			</div>
		);
	}

	const groupKeys = () => [...(boardEl.current?.querySelectorAll<HTMLElement>(".grp") ?? [])].map((el) => el.dataset.key!);
	const [allClosed, setAllClosed] = useState(false);
	useLayoutEffect(() => {
		const keys = groupKeys();
		setAllClosed(keys.length > 0 && keys.every((k) => collapsed.has(k)));
	});

	const onBoardClick = (e: MouseEvent<HTMLDivElement>) => {
		const g = (e.target as Element).closest<HTMLElement>(".gh");
		if (g) {
			const k = g.dataset.group!;
			const next = new Set(collapsed);
			next.has(k) ? next.delete(k) : next.add(k);
			setCollapsed(next);
			persist({ collapsed: [...next] });
			return;
		}
		const c = (e.target as Element).closest<HTMLElement>("[data-key], [data-ep], [data-open]");
		if (c) activate(c);
	};
	const onDialogClick = (e: MouseEvent<HTMLDivElement>) => {
		if ((e.target as Element).closest("[data-back]")) {
			setTrail((t) => t.slice(0, -1));
			return;
		}
		const row = (e.target as Element).closest<HTMLElement>("[data-key], [data-ep]");
		if (row) activate(row);
	};

	const searchBox = (
		<label className="search">
			<span>
				<Icon name="MagnifyingGlass" />
			</span>
			<input
				id="archQ"
				type="search"
				placeholder="Search"
				aria-label="Search routes and calls"
				autoComplete="off"
				onChange={(e) => {
					setQ(e.target.value.trim());
					setTrace(null);
				}}
			/>
		</label>
	);

	const toolbar = (
		<>
			<span className="pill" id="archWhen" title={built ? `${built.map.deployment ?? "Deployment Missing"} · warm request of two loads per route` : undefined}>
				{built ? `Tempo ${ddmmyyyy(Date.parse(built.map.window.from))} ${hhmm(built.map.window.from)}–${hhmm(built.map.window.to)}` : ""}
			</span>
			<label className="order">
				<span>
					<Icon name="ArrowsDownUp" />
				</span>
				<span className="sr-only">Order</span>
				<select
					id="archOrder"
					aria-label="Order routes"
					value={order}
					onChange={(e: ChangeEvent<HTMLSelectElement>) => {
						setOrder(e.target.value);
						persist({ order: e.target.value });
					}}
				>
					<option value="slow">Slowest first</option>
					<option value="calls">Most database calls</option>
					<option value="waves">Most waves</option>
					<option value="title">Route A to Z</option>
				</select>
				<span className="caret">
					<Icon name="CaretDown" />
				</span>
			</label>
			<button
				type="button"
				className="btn"
				id="archCollapse"
				onClick={() => {
					const keys = groupKeys();
					const next = new Set(collapsed);
					for (const k of keys) allClosed ? next.delete(k) : next.add(k);
					setCollapsed(next);
					persist({ collapsed: [...next] });
				}}
			>
				{allClosed ? "Expand all" : "Collapse all"}
			</button>
		</>
	);

	const view = trail[trail.length - 1];
	return (
		<>
			{tools ? createPortal(toolbar, tools) : null}
			{search ? createPortal(searchBox, search) : null}
			<div
				className="board arch"
				id="arch"
				ref={boardEl}
				onPointerOver={(e) => {
					const c = (e.target as Element).closest<HTMLElement>(".card[data-key]");
					const k = c ? c.dataset.key! : null;
					if (k !== trace) setTrace(k);
				}}
				onPointerLeave={() => trace && setTrace(null)}
				onClick={onBoardClick}
				onKeyDown={(e) => {
					const c = (e.target as Element).closest<HTMLElement>(".card[data-key], .card[data-ep], .card[data-open]");
					if (c && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						activate(c);
					}
				}}
			>
				{surface}
			</div>
			<Modal
				id="archDetails"
				className={`wide${view && view.kind !== "cache" ? " doc-mode" : ""}`}
				labelledBy="ad-title"
				open={open}
				onClose={() => {
					setOpen(false);
					setTrail([]);
				}}
				backdrop
				ref={modal}
			>
				{view && built && L ? (
					<div className="dlg" onClick={onDialogClick}>
						<button type="button" className="x" aria-label="Close" onClick={() => modal.current?.close()}>
							<Icon name="X" />
						</button>
						{trail.length > 1 ? (
							<div className="doc-head">
								<button type="button" className="icon-btn" data-back aria-label="Back">
									<Icon name="CaretLeft" />
								</button>
								<span className="crumb">{viewTitle(built, L, trail[trail.length - 2])}</span>
							</div>
						) : null}
						<DetailsBody
							b={built}
							L={L}
							v={view}
							timeline={(rows, total) => <Timeline rows={rows} total={total} budgetMs={built.map.budgetMs} widths={widths} setWidth={setWidth} />}
						/>
					</div>
				) : null}
			</Modal>
		</>
	);
}

export const Architecture = memo(ArchitectureView);
