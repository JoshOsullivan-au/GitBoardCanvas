// SPDX-License-Identifier: MIT
// The Roadmap tab: stage columns, a group of cards per column, links traced on hover or focus, moves by drag or keyboard.
import {
	type ChangeEvent,
	Component,
	type CSSProperties,
	type FocusEvent,
	type HTMLAttributes,
	type KeyboardEvent,
	memo,
	type PointerEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

import type { Board, MovePlan } from "../../types.js";
import { api } from "../lib/api";
import { type Route, replaceRoute } from "../lib/hash";
import { placeFilters } from "../lib/nav";
import { ddmm, firstLine, plural } from "../lib/format";
import { Icon } from "../lib/icon";
import { drawRoutes, type Link } from "../lib/routes";
import { load, save } from "../lib/storage";
import { Modal, type ModalHandle, usePage } from "../lib/ui";
import { Card } from "./Card";
import { type Crumb, Details, type DetailsView } from "./Details";
import {
	activeFilters,
	buildModel,
	cellCards,
	emptyFilters,
	type Feature,
	FILTER_GROUPS,
	filterOptions,
	type Filters,
	GROUP_NAME,
	groupIcon,
	type Held,
	isBlocked,
	isDone,
	lastStage,
	type Model,
	ORDER_LABELS,
	placed,
	searchHit,
	stageName,
	type View,
	visible,
} from "./model";
import { MoveConfirm, type MoveState } from "./Move";

const POLL_MS = 3000;
const SPRING_MS = 650;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

type Saved = { collapsed: string[]; filters: Partial<Record<string, string[]>>; order: string };
type Drag = { id: string; from: number; group: string; sx: number; sy: number; dx: number; dy: number; w: number; active: boolean; over: string | null };
type Grab = { id: string; from: number };

type Snap = { rects: Map<string, DOMRect>; keepFocus: boolean };

/**
 * The board surface. A class for getSnapshotBeforeUpdate: card positions are read before React changes the DOM, and
 * cards that moved slide from where they were (FLIP) on the board's spring.
 */
class Surface extends Component<{ el: RefObject<HTMLDivElement | null>; flip: RefObject<boolean>; onUpdated: (keepFocus: boolean) => void; handlers: HTMLAttributes<HTMLDivElement>; children: ReactNode }> {
	getSnapshotBeforeUpdate(): Snap {
		const board = this.props.el.current;
		const rects = new Map<string, DOMRect>();
		if (board && this.props.flip.current && !reduced()) {
			board.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => rects.set(el.dataset.card!, el.getBoundingClientRect()));
		}
		return { rects, keepFocus: Boolean(board?.contains(document.activeElement)) };
	}

	componentDidUpdate(_p: unknown, _s: unknown, snap: Snap) {
		const board = this.props.el.current;
		this.props.flip.current = true;
		if (board && snap.rects.size) {
			const easing = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim();
			board.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => {
				const a = snap.rects.get(el.dataset.card!);
				if (!a) return;
				const b = el.getBoundingClientRect();
				const dx = a.left - b.left,
					dy = a.top - b.top;
				if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
				el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: SPRING_MS, easing });
			});
		}
		this.props.onUpdated(snap.keepFocus);
	}

	render() {
		return (
			<div className="board" id="board" ref={this.props.el} {...this.props.handlers}>
				{this.props.children}
			</div>
		);
	}
}

function Loading() {
	const bar = (w: number) => <div className="sk" style={{ height: 10, width: `${w}%` }}></div>;
	return (
		<div className="fwcols" style={{ "--cols": 4 } as CSSProperties}>
			{[1, 2, 3, 4].map((i) => (
				<section key={i} className="fwcol lg lg-clear">
					<header className="fwsh lg lg-regular">
						<div className="t">{bar(40)}</div>
					</header>
					{[0, 1].map((g) => (
						<div key={g} className="grp" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
							{bar(40)}
							{[0, 1, 2].slice(0, 3 - g).map((k) => (
								<div key={k} className="sk" style={{ height: 52, borderRadius: 12 }}></div>
							))}
						</div>
					))}
				</section>
			))}
		</div>
	);
}

/** What the shell shows of the Roadmap: its read model for the sidebar's counts, when git was last read, and whether
 * the last version poll failed (the server is not answering). */
export type RoadmapStatus = { model: Model | null; readAt: number | null; failed: boolean };

function RoadmapView({
	tools,
	search,
	route,
	onStatus,
	show,
}: {
	tools: HTMLElement | null;
	search: HTMLElement | null;
	route: Route;
	onStatus: (s: RoadmapStatus) => void;
	/** A feature the shell asks to open in the details panel; `n` counts the asks, so the same feature opens again. */
	show: { id: string; n: number } | null;
}) {
	const { toast, say } = usePage();
	const [model, setModel] = useState<Model | null>(null);
	const [loading, setLoading] = useState(true);
	const [readAt, setReadAt] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const [saved] = useState(() => load<Saved>("gitboard-view"));
	const [collapsed, setCollapsed] = useState(() => new Set(saved.collapsed ?? []));
	const [filters, setFilters] = useState<Filters>(() => {
		const f = emptyFilters();
		for (const g of FILTER_GROUPS) f[g] = new Set(saved.filters?.[g] ?? []);
		return f;
	});
	const [order, setOrder] = useState(saved.order ?? "touched");
	const [q, setQ] = useState("");
	const [trace, setTrace] = useState<string | null>(null);
	const [grab, setGrab] = useState<Grab | null>(null);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [held, setHeld] = useState<Held>(null);
	const [panel, setPanel] = useState(false);
	const [details, setDetails] = useState<DetailsView | null>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [move, setMove] = useState<MoveState | null>(null);
	const [moveOpen, setMoveOpen] = useState(false);

	const boardEl = useRef<HTMLDivElement>(null);
	const filterBtn = useRef<HTMLButtonElement>(null);
	const moveModal = useRef<ModalHandle>(null);
	const detailsModal = useRef<ModalHandle>(null);
	const flip = useRef(true);
	const noFlip = () => {
		flip.current = false;
	};
	const version = useRef<string | null>(null);
	const busy = useRef(false);
	const dragRef = useRef<Drag | null>(null);
	const grabRef = useRef<Grab | null>(null);
	const heldRef = useRef<Held>(null);
	const moved = useRef(false);
	const focusId = useRef<string | null>(null);
	const focusing = useRef(false);
	const ghost = useRef<HTMLDivElement | null>(null);

	const hold = (h: Held) => {
		heldRef.current = h;
		setHeld(h);
	};
	const persist = (next: { collapsed?: Set<string>; filters?: Filters; order?: string }) =>
		save("gitboard-view", {
			collapsed: [...(next.collapsed ?? collapsed)],
			// A "Needs you" place's filter is not the person's: save the filters it stands in for.
			filters: Object.fromEntries(FILTER_GROUPS.map((g) => [g, [...(next.filters ?? ownFilters.current ?? filters)[g]]])),
			order: next.order ?? order,
		});

	/* ---- server ---- */
	const failedRead = useRef(true);
	const refresh = useCallback(async () => {
		failedRead.current = true;
		const data = await api<Board>("/api/board");
		failedRead.current = false;
		version.current = data.version;
		setModel(buildModel(data));
		setReadAt(data.readAt || null);
		setLoading(false);
	}, []);
	useEffect(() => {
		let stop = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const quiet = () => !dragRef.current && !grabRef.current && !busy.current && !document.querySelector("dialog[open]");
		const poll = async () => {
			try {
				const { version: v } = await api<{ version: string }>("/api/version");
				// Answering is not enough: the board counts as read only once a read it needs has landed.
				if (v !== version.current && quiet()) await refresh();
				setFailed(failedRead.current);
			} catch {
				/* the next tick tries again; until then the shell says when the board was last read */
				setFailed(true);
			}
			if (!stop) timer = setTimeout(poll, POLL_MS);
		};
		refresh()
			.catch((error: Error) => {
				setLoading(false);
				setFailed(true);
				toast(`Could not read the roadmap. ${firstLine(error.message)}`, { err: true });
			})
			.finally(() => {
				if (!stop) timer = setTimeout(poll, POLL_MS);
			});
		return () => {
			stop = true;
			clearTimeout(timer);
		};
	}, [refresh, toast]);

	useEffect(() => onStatus({ model, readAt, failed }), [model, readAt, failed, onStatus]);

	/* ---- the sidebar's places: a "Needs you" item shows only its one filter while you are there, and leaving puts the
	   person's own filters back; a stage scrolls into view ---- */
	const ownFilters = useRef<Filters | null>(null);
	const searchInput = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const next = placeFilters(route.need, filters, ownFilters.current);
		ownFilters.current = next.own;
		if (next.shown !== filters) {
			noFlip();
			setFilters(next.shown);
		}
		// A "Needs you" count is what the place shows: a search left over from before would hide some of it.
		if (route.need && searchInput.current?.value) {
			searchInput.current.value = "";
			setQ("");
		}
		// Only a change of place sets the filters.
	}, [route.need]);
	/** The person changed the filters: they are theirs now, kept, and the "Needs you" place is left. */
	const ownChange = (next: Filters) => {
		ownFilters.current = null;
		noFlip();
		setFilters(next);
		persist({ filters: next });
		if (route.need) replaceRoute({ view: "roadmap" });
	};
	useEffect(() => {
		if (!route.stage || loading) return;
		const col = boardEl.current?.querySelector(`.fwcol[data-stage="${route.stage}"]`);
		col?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest", inline: "start" });
	}, [route.stage, loading]);

	/* ---- what shows ---- */
	const opts = useMemo(() => (model ? filterOptions(model) : null), [model]);
	const cards = useMemo(() => (model ? placed(model, held) : []), [model, held]);
	const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
	const view: View | null = opts && { q, filters, opts, order, pinned: drag?.id ?? grab?.id ?? null, branch: route.branch };
	const traced = trace ? (byId.get(trace) ?? null) : null;
	const groupKeys = () =>
		model && view ? model.stages.flatMap((s) => model.groups.filter((g) => cellCards(cards, view, g, s.id).length).map((g) => `${s.id}|${g}`)) : [];
	const allKeys = groupKeys();
	const allClosed = allKeys.length > 0 && allKeys.every((k) => collapsed.has(k));
	const nFilters = activeFilters(filters);

	/* ---- links: hover or focus a card to draw what it waits on, what it unblocks and what it links to ---- */
	const latest = useRef({ byId, trace: traced, dragging: false });
	latest.current = { byId, trace: traced, dragging: Boolean(drag) };
	const drawLinks = useCallback(() => {
		const cols = boardEl.current?.querySelector(".fwcols");
		const { byId: ids, trace: t, dragging } = latest.current;
		const end = (id: string) => ({ el: ids.has(id) ? cols?.querySelector(`[data-card="${CSS.escape(id)}"]`) : null, col: (ids.get(id)?.stage ?? 0) - 1 });
		const links: Link[] = [];
		if (cols && t && model && !dragging) {
			const seen = new Set<string>();
			const done = (id: string) => isDone(model, ids.get(id)!);
			for (const d of t.deps) {
				seen.add(d);
				links.push({ from: end(d), to: end(t.id), cls: !done(d) && !done(t.id) ? "blk" : "dep", arrow: true });
			}
			for (const d of t.dependents) {
				seen.add(d);
				links.push({ from: end(t.id), to: end(d), cls: !done(t.id) && !done(d) ? "blk" : "dep", arrow: true });
			}
			for (const l of new Set([...t.links, ...t.backlinks])) if (!seen.has(l)) links.push({ from: end(t.id), to: end(l), cls: "lnk", arrow: false });
		}
		drawRoutes(cols, links);
	}, [model]);
	useLayoutEffect(() => drawLinks());
	/* The window or the sidebar beside the board changed its width: columns that fill it moved. */
	useEffect(() => {
		const ro = new ResizeObserver(() => drawLinks());
		if (boardEl.current) ro.observe(boardEl.current);
		return () => ro.disconnect();
	}, [drawLinks]);

	/** Focus a card without tracing it: re-renders and closing dialogs hand focus back, the person did not move it. */
	const quietFocus = (id: string | null) => {
		const el = id ? boardEl.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`) : null;
		if (!el) return;
		focusing.current = true;
		el.focus({ preventScroll: false });
		focusing.current = false;
	};
	const onUpdated = (keepFocus: boolean) => {
		if (focusId.current && keepFocus) quietFocus(focusId.current);
	};

	/* ---- details ---- */
	const openDetails = (id: string) => {
		setDetails({ kind: "card", id });
		setDetailsOpen(true);
	};
	useEffect(() => {
		if (show && model?.byId.has(show.id)) openDetails(show.id);
		// One ask, one open: a new model alone does not reopen the panel.
	}, [show?.n]);
	const openDoc = async (id: string, path: string, label: string, phaseIndex: number | null, trail: Crumb[] = []) => {
		if (!detailsOpen) openDetails(id);
		let doc: { html: string };
		try {
			doc = await api<{ html: string }>(`/api/doc?path=${encodeURIComponent(path)}`);
		} catch (error) {
			toast(firstLine((error as Error).message), { err: true });
			return;
		}
		setDetails({ kind: "doc", id, path, label, phaseIndex, trail, html: doc.html });
	};
	const closeDetails = () => {
		setDetailsOpen(false);
		if (details) {
			focusId.current = details.id;
			quietFocus(details.id);
		}
	};

	/* ---- move: the drop is the human gate, the plan names the consequences ---- */
	const revert = () => hold(null);
	async function askMove(c: Feature, from: number) {
		const h = heldRef.current;
		const to = h?.id === c.id ? h.stage : from;
		if (to === from) {
			revert();
			return;
		}
		let plan: MovePlan;
		busy.current = true;
		try {
			plan = await api<MovePlan>("/api/plan", { slug: c.slug, from, to });
		} catch (error) {
			revert();
			toast((error as Error).message, { err: true });
			return;
		} finally {
			busy.current = false;
		}
		if (plan.blocked) {
			revert();
			toast(`Could not move ${c.title}. ${plan.blocked}`, { err: true });
			return;
		}
		moved.current = false;
		setMove({ slug: c.slug, title: c.title, from, to, plan, running: false, error: null });
		setMoveOpen(true);
	}
	async function runMove() {
		if (!move || !model) return;
		const { slug, title, from, to } = move;
		setMove({ ...move, running: true });
		busy.current = true;
		try {
			const { commit } = await api<{ commit: string }>("/api/move", { slug, from, to });
			moved.current = true;
			moveModal.current?.close();
			say(`${title} moved to ${stageName(model, to)}.`);
			toast(`${title} moved to ${stageName(model, to)} · ${commit.slice(0, 8)}`, { undo: () => undoMove(slug, to, from, title) });
		} catch (error) {
			// Keep the plan on screen with what went wrong; closing puts the card back.
			setMove({ ...move, running: false, error: `Could not move ${title}. ${(error as Error).message}` });
			say(`Could not move ${title}.`);
		} finally {
			busy.current = false;
			await refresh().catch(() => {});
			if (moved.current) revert();
		}
	}
	const closeMove = () => {
		setMoveOpen(false);
		if (!move) return;
		if (!moved.current && !busy.current) {
			revert();
			say("Move cancelled.");
		}
		focusId.current = `${moved.current ? move.to : move.from}:${move.slug}`;
	};
	async function undoMove(slug: string, from: number, to: number, title: string) {
		busy.current = true;
		try {
			const plan = await api<MovePlan>("/api/plan", { slug, from, to });
			if (plan.blocked) throw new Error(plan.blocked);
			await api("/api/move", { slug, from, to });
			say(`${title} moved back to ${model ? stageName(model, to) : to}.`);
		} catch (error) {
			toast(`Could not move ${title} back. ${firstLine((error as Error).message)}`, { err: true });
		} finally {
			busy.current = false;
			await refresh().catch(() => {});
		}
	}

	/* ---- pointer drag: a card stays in its group; only the stage changes ---- */
	const clearDrag = () => {
		dragRef.current = null;
		ghost.current?.remove();
		ghost.current = null;
		document.body.style.cursor = "";
		setDrag(null);
	};
	const cardOf = (target: EventTarget | null) => {
		const el = (target as Element | null)?.closest?.<HTMLElement>("[data-card]");
		return el ? byId.get(el.dataset.card!) : undefined;
	};
	const handlers: HTMLAttributes<HTMLDivElement> = {
		onPointerDown(e: PointerEvent<HTMLDivElement>) {
			const el = (e.target as Element).closest<HTMLElement>("[data-card]");
			if (!el || e.button !== 0 || busy.current) return;
			const c = byId.get(el.dataset.card!)!;
			const r = el.getBoundingClientRect();
			dragRef.current = { id: c.id, from: c.stage, group: c.group, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, active: false, over: null };
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		onPointerMove(e: PointerEvent<HTMLDivElement>) {
			const d = dragRef.current;
			if (!d || !model) return;
			if (!d.active) {
				if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
				d.active = true;
				setTrace(null);
				const c = byId.get(d.id)!;
				const g = document.createElement("div");
				g.className = "ghost enter";
				g.style.width = `${d.w}px`;
				const ref = Object.assign(document.createElement("span"), { className: "ref", textContent: ddmm(c.touchedAt) });
				const title = Object.assign(document.createElement("p"), { className: "title", textContent: c.title });
				g.append(ref, title);
				document.body.append(g);
				ghost.current = g;
				requestAnimationFrame(() => ghost.current?.classList.remove("enter"));
				document.body.style.cursor = "grabbing";
				noFlip();
				setDrag({ ...d });
			}
			const g = ghost.current!;
			g.style.left = `${e.clientX - d.dx}px`;
			g.style.top = `${e.clientY - d.dy}px`;
			const hit = [...e.currentTarget.querySelectorAll<HTMLElement>(`.cell[data-cellgroup="${CSS.escape(d.group)}"]`)].find((cell) => {
				const r = cell.getBoundingClientRect();
				return e.clientX >= r.left && e.clientX <= r.right;
			});
			if (!hit) return;
			const stage = Number(hit.dataset.stage);
			const over = `${d.group}|${stage}`;
			const key = `${stage}|${d.group}`;
			setCollapsed((prev) => (prev.has(key) ? new Set([...prev].filter((k) => k !== key)) : prev));
			const now = heldRef.current?.id === d.id ? heldRef.current.stage : model.byId.get(d.id)!.stage;
			if (now !== stage) hold({ id: d.id, stage });
			if (now !== stage || d.over !== over) {
				d.over = over;
				setDrag({ ...d });
			}
		},
		onPointerUp() {
			const d = dragRef.current;
			if (!d) return;
			clearDrag();
			const c = byId.get(d.id)!;
			if (!d.active) {
				openDetails(c.id);
				return;
			}
			noFlip();
			void askMove(c, d.from);
		},
		onPointerCancel() {
			const d = dragRef.current;
			clearDrag();
			if (d?.active) revert();
		},
		onPointerOver(e: PointerEvent<HTMLDivElement>) {
			if (dragRef.current) return;
			const c = cardOf(e.target);
			if (c && c.id !== trace) setTrace(c.id);
		},
		onPointerLeave() {
			setTrace(null);
		},
		// Keyboard focus traces like hover; focus a script or dialog hands back does not.
		onFocus(e: FocusEvent<HTMLDivElement>) {
			const el = (e.target as Element).closest("[data-card]");
			if (el && !focusing.current && el.matches(":focus-visible")) setTrace((el as HTMLElement).dataset.card!);
		},
		onBlur(e: FocusEvent<HTMLDivElement>) {
			if (!(e.relatedTarget as Element | null)?.closest?.("[data-card]") && !e.currentTarget.matches(":hover")) setTrace(null);
		},
		onTransitionEnd(e) {
			if ((e.target as Element).classList?.contains("gb")) drawLinks();
		},
		/* ---- keyboard: Space grabs and drops, arrows change stage, Escape cancels, Enter opens ---- */
		onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
			const c = cardOf(e.target);
			if (!c || busy.current || !model) return;
			const g = grabRef.current;
			focusId.current = c.id;
			if (e.key === " ") {
				e.preventDefault();
				if (g?.id === c.id) {
					grabRef.current = null;
					setGrab(null);
					void askMove(c, g.from);
				} else {
					if (g) revert();
					grabRef.current = { id: c.id, from: c.stage };
					setGrab(grabRef.current);
					say(`${c.title} grabbed. Left and right arrows change the stage.`);
				}
			} else if (e.key === "Escape" && g?.id === c.id) {
				e.preventDefault();
				grabRef.current = null;
				setGrab(null);
				revert();
				say("Move cancelled.");
			} else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && g?.id === c.id) {
				e.preventDefault();
				const next = c.stage + (e.key === "ArrowLeft" ? -1 : 1);
				if (!model.stages.some((s) => s.id === next)) return;
				hold({ id: c.id, stage: next });
				say(stageName(model, next));
			} else if (e.key === "Enter" && !g) {
				e.preventDefault();
				openDetails(c.id);
			}
		},
		onClick(e) {
			const b = (e.target as Element).closest<HTMLElement>("[data-group]");
			if (!b) return;
			const key = b.dataset.group!;
			const next = new Set(collapsed);
			next.has(key) ? next.delete(key) : next.add(key);
			noFlip();
			setCollapsed(next);
			persist({ collapsed: next });
		},
	};

	/* ---- filter panel: closes on Escape or a press outside it ---- */
	useEffect(() => {
		if (!panel) return;
		const down = (e: globalThis.PointerEvent) => {
			if (!(e.target as Element).closest?.(".pop-wrap")) setPanel(false);
		};
		const key = (e: globalThis.KeyboardEvent) => {
			if (e.key === "Escape") {
				setPanel(false);
				filterBtn.current?.focus();
			}
		};
		document.addEventListener("pointerdown", down);
		document.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("pointerdown", down);
			document.removeEventListener("keydown", key);
		};
	}, [panel]);
	const toggleFilter = (g: (typeof FILTER_GROUPS)[number], v: string) => {
		const next = { ...filters, [g]: new Set(filters[g]) };
		next[g].has(v) ? next[g].delete(v) : next[g].add(v);
		ownChange(next);
	};
	const clearFilters = () => {
		ownChange(emptyFilters());
	};

	/* ---- render ---- */
	let surface: ReactNode = null;
	if (loading) surface = <Loading />;
	else if (model && view) {
		const last = lastStage(model);
		const shownStages = model.stages.filter((s) => !filters.stage.size || filters.stage.has(String(s.id)));
		surface = (
			<div className={`fwcols${trace ? " tracing" : ""}`} style={{ "--cols": shownStages.length } as CSSProperties}>
				<svg className="fwlinks" aria-hidden="true"></svg>
				{shownStages.map((s) => {
					const n = cards.filter((c) => c.stage === s.id && visible(view, c)).length;
					const groups = model.groups.filter((group) => cellCards(cards, view, group, s.id).length || (drag?.active && drag.group === group));
					return (
						<section
							key={s.id}
							className={`fwcol lg lg-clear${model.stages.length > 2 && s.id === last - 1 ? " now" : ""}`}
							aria-label={`${s.id} ${s.name}`}
							data-stage={s.id}
						>
							<header className="fwsh lg lg-regular">
								<div className="t">
									<span className="sn">{s.id}</span>
									{s.name}
								</div>
								<span className="cnt">{n}</span>
							</header>
							{groups.map((group) => {
								const list = cellCards(cards, view, group, s.id);
								const key = `${s.id}|${group}`;
								const open = !collapsed.has(key);
								const blocked = list.filter(isBlocked).length;
								const gated = list.filter((c) => !isBlocked(c) && c.gated).length;
								return (
									<div key={group} className={`grp${list.length ? "" : " empty"}`} data-collapsed={open ? undefined : ""} data-key={key}>
										<button type="button" className="gh" data-group={key} aria-expanded={open}>
											<span className="car">
												<Icon name="CaretRight" />
											</span>
											<span className="gi">
												<Icon name={groupIcon(model, group)} />
											</span>
											<span className="gn">{group}</span>
											{blocked ? (
												<span className="gm blk" title={plural(blocked, "blocked feature")}>
													<Icon name="Lock" />
													{blocked}
												</span>
											) : null}
											{gated ? (
												<span className="gm" title={plural(gated, "gated feature")}>
													<Icon name="HourglassMedium" />
													{gated}
												</span>
											) : null}
											<span className="pill">{list.length}</span>
										</button>
										<div className="gb">
											<div className="inner">
												<div
													className="cell"
													data-cellgroup={group}
													data-stage={s.id}
													aria-label={`${group}, ${s.name}`}
													data-over={drag?.over === `${group}|${s.id}` ? "" : undefined}
												>
													{list.map((c) => (
														<Card key={c.id} m={model} c={c} trace={traced} grabbed={grab?.id === c.id} dragging={Boolean(drag?.active && drag.id === c.id)} />
													))}
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</section>
					);
				})}
			</div>
		);
	}

	const searchBox = (
		<label className="search">
			<span>
				<Icon name="MagnifyingGlass" />
			</span>
			<input
				id="q"
				ref={searchInput}
				type="search"
				placeholder="Search"
				aria-label="Search features"
				autoComplete="off"
				onChange={(e) => {
					focusId.current = null;
					noFlip();
					setQ(e.target.value.trim());
				}}
			/>
		</label>
	);

	const toolbar = (
		<>
			{route.branch ? (
				<a className="btn" id="branchChip" href="#/roadmap" title="Show every feature">
					<Icon name="GitBranch" />
					<span>{route.branch}</span>
					<Icon name="X" />
				</a>
			) : null}
			<div className="pop-wrap">
				<button type="button" className="btn" id="filterBtn" ref={filterBtn} aria-expanded={panel} aria-controls="filterPanel" onClick={() => setPanel(!panel)}>
					<span>
						<Icon name="Funnel" />
					</span>
					Filter
					<span className="fcount" id="fcount" hidden={!nFilters}>
						{nFilters}
					</span>
				</button>
				<div className="pop" id="filterPanel" role="dialog" aria-label="Filter" hidden={!panel}>
					{panel && model && opts && view ? (
						<>
							{FILTER_GROUPS.map((g) => (
								<div key={g} className="fg">
									<div className="fgh">
										{GROUP_NAME[g]}
										{g === "git" && model.github === false ? <span className="miss">PR: Missing GitHub</span> : null}
									</div>
									<div className="fopts">
										{opts[g].map(([v, label, ic, test]) => (
											<button key={v} type="button" className="opt" data-g={g} data-v={v} aria-pressed={filters[g].has(v)} onClick={() => toggleFilter(g, v)}>
												{ic ? <Icon name={ic} /> : null}
												<span>{label}</span>
												<b>{cards.filter((c) => searchHit(q, c)).filter(test).length}</b>
											</button>
										))}
									</div>
								</div>
							))}
							<div className="pf">
								<span>{plural(cards.filter((c) => visible(view, c)).length, "feature")} shown</span>
								<button type="button" className="btn" data-clear disabled={!nFilters} onClick={clearFilters}>
									Clear
								</button>
							</div>
						</>
					) : null}
				</div>
			</div>
			<label className="order">
				<span>
					<Icon name="ArrowsDownUp" />
				</span>
				<span className="sr-only">Order</span>
				<select
					id="order"
					aria-label="Order cards"
					value={order}
					onChange={(e: ChangeEvent<HTMLSelectElement>) => {
						setOrder(e.target.value);
						persist({ order: e.target.value });
					}}
				>
					{ORDER_LABELS.map(([v, label]) => (
						<option key={v} value={v}>
							{label}
						</option>
					))}
				</select>
				<span className="caret">
					<Icon name="CaretDown" />
				</span>
			</label>
			<button
				type="button"
				className="btn"
				id="collapse"
				onClick={() => {
					const next = allClosed ? new Set<string>() : new Set(allKeys);
					noFlip();
					setCollapsed(next);
					persist({ collapsed: next });
				}}
			>
				{allClosed ? "Expand all" : "Collapse all"}
			</button>
		</>
	);

	return (
		<>
			{tools ? createPortal(toolbar, tools) : null}
			{search ? createPortal(searchBox, search) : null}
			<Surface el={boardEl} flip={flip} onUpdated={onUpdated} handlers={handlers}>
				{surface}
			</Surface>
			<Modal id="details" className={`wide${details?.kind === "doc" ? " doc-mode" : ""}`} labelledBy="d-title" open={detailsOpen} onClose={closeDetails} backdrop ref={detailsModal}>
				{details && model ? (
					<Details
						m={model}
						byId={byId}
						view={details}
						open={{ details: openDetails, doc: (...a) => void openDoc(...a) }}
						close={() => detailsModal.current?.close()}
					/>
				) : null}
			</Modal>
			<Modal
				id="confirm"
				className="wide"
				labelledBy="c-title"
				open={moveOpen}
				onClose={closeMove}
				onCancel={(e) => busy.current && e.preventDefault()}
				ref={moveModal}
			>
				{move && model ? <MoveConfirm m={model} mv={move} onMove={() => void runMove()} onCancel={() => moveModal.current?.close()} /> : null}
			</Modal>
		</>
	);
}

/* The shell re-renders on its own state (the sidebar, the theme, the docs list); the board only on its own props. */
export const Roadmap = memo(RoadmapView);
