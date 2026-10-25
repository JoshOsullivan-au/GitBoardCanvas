// SPDX-License-Identifier: MIT
// The board's one link router, shared by the Roadmap and Architecture tabs. It reads the laid-out columns and cards
// and draws into the columns' .fwlinks svg.

/** A link end: a card element and its column index. */
export type End = { el: Element | null | undefined; col: number };
/** lnk: a mention; dep: a dependency that no longer blocks; blk: a solid call (the map); stop: one side still blocks the
 * other (red dots, drawn on top). */
export type Link = { from: End; to: End; cls: "lnk" | "dep" | "blk" | "stop"; arrow: boolean };

type Box = { x: number; y: number; w: number; h: number; col: number };

/** Draws `links` into the board's .fwlinks. */
export function drawRoutes(cols: Element | null | undefined, links: Link[]): void {
	const svg = cols?.querySelector(".fwlinks");
	if (!cols || !svg) return;
	if (!links.length) {
		svg.innerHTML = "";
		return;
	}
	const base = cols.getBoundingClientRect();
	const colEls = [...cols.querySelectorAll(".fwcol")];
	const colRects = colEls.map((el) => {
		const r = el.getBoundingClientRect();
		return { l: r.left - base.left, r: r.right - base.left };
	});
	const box = ({ el, col }: End): Box | null => {
		if (!el) return null;
		const anchor = el.closest(".grp[data-collapsed]")?.querySelector(".gh") ?? el;
		const r = anchor.getBoundingClientRect();
		return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, col };
	};
	// Lines never cross a card: they run vertically in the gutters between columns (gutter g sits left of column g)
	// and cross a column only through an empty channel between its cards, group rows and header. Lines that share a
	// gutter or a channel run on one path and branch off where they part.
	const gutterX = (g: number) =>
		g === 0 ? colRects[0].l + 4 : g === colRects.length ? colRects[g - 1].r - 4 : (colRects[g - 1].r + colRects[g].l) / 2;
	const channels = colEls.map((el) => {
		const r = el.getBoundingClientRect();
		const solid = [...el.querySelectorAll(".fwsh, .gh, .card, .card .chips")]
			.filter((n) => !n.closest(".grp[data-collapsed] .gb"))
			.map((n) => {
				const b = n.getBoundingClientRect();
				return [b.top - base.top - 3, b.bottom - base.top + 3] as const;
			})
			.sort((a, b) => a[0] - b[0]);
		const free: [number, number][] = [];
		let at = r.top - base.top;
		for (const [top, bottom] of solid) {
			if (top - at >= 6) free.push([at, top]);
			at = Math.max(at, bottom);
		}
		if (r.bottom - base.top - 8 - at >= 6) free.push([at, r.bottom - base.top - 8]);
		return free;
	});
	const used = new Set<string>();
	/** The channel through column k for a line at y heading to y2: least vertical travel, one already in use, roomy gaps, then nearest y2. */
	const channel = (k: number, y: number, y2: number) => {
		let best: { cost: number; key: string; y: number } | null = null;
		channels[k].forEach(([top, bottom], i) => {
			const mid = Math.round((top + bottom) / 2);
			const key = `${k}.${i}`;
			const cost = Math.abs(y - mid) + Math.abs(mid - y2) - (used.has(key) ? 80 : 0) + (bottom - top < 14 ? 40 : 0) + Math.abs(mid - y2) / 1000;
			if (!best || cost < best.cost) best = { cost, key, y: mid };
		});
		if (best) used.add((best as { key: string }).key);
		return best as { cost: number; key: string; y: number } | null;
	};
	/** Corner points from source to target: out to a gutter, along it, across a channel, ... into the target. */
	const route = (A: Box, B: Box) => {
		const y1 = A.y + A.h / 2,
			y2 = B.y + B.h / 2;
		const dir = Math.sign(B.col - A.col);
		const x1 = dir > 0 ? A.x + A.w : A.x;
		const x2 = dir < 0 ? B.x + B.w + 4 : B.x - 4;
		const pts: [number, number][] = [[x1, y1]];
		let y = y1;
		for (let k = A.col + dir; dir && k !== B.col; k += dir) {
			const c = channel(k, y, y2);
			if (!c) return null;
			const x = gutterX(dir > 0 ? k : k + 1);
			pts.push([x, y], [x, c.y]);
			y = c.y;
		}
		const x = gutterX(dir < 0 ? B.col + 1 : B.col);
		pts.push([x, y], [x, y2], [x2, y2]);
		return { pts, x2, y2, dir: dir || 1 };
	};
	// Each line is cut into straight runs and rounded corners; runs on the same line of the same kind merge, and a
	// corner shared by several lines is drawn once, so a shared path is one stroke.
	const R = 6;
	const KINDS = ["lnk", "dep", "blk", "stop"] as const;
	const kinds = Object.fromEntries(
		KINDS.map((cls) => [cls, { runs: new Map<string, [number, number][]>(), corners: new Set<string>(), heads: new Set<string>() }]),
	) as Record<Link["cls"], { runs: Map<string, [number, number][]>; corners: Set<string>; heads: Set<string> }>;
	const n1 = (v: number) => Math.round(v * 2) / 2;
	const trace = (pts: [number, number][], cls: Link["cls"]) => {
		const p = pts.filter((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) + Math.abs(q[1] - pts[i - 1][1]) > 0.5);
		const len = (i: number) => Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
		const r = p.map((_, i) => (i === 0 || i === p.length - 1 ? 0 : Math.min(R, len(i - 1) / 2, len(i) / 2)));
		const k = kinds[cls];
		for (let i = 0; i < p.length - 1; i++) {
			const [ax, ay] = p[i],
				[bx, by] = p[i + 1];
			const flat = Math.abs(ay - by) < 0.5;
			const at = flat ? n1(ay) : n1(ax);
			let s = flat ? ax : ay,
				e = flat ? bx : by;
			const sg = Math.sign(e - s);
			s += sg * r[i];
			e -= sg * r[i + 1];
			const key = `${flat ? "h" : "v"}${at}`;
			(k.runs.get(key) ?? k.runs.set(key, []).get(key)!).push([Math.min(s, e), Math.max(s, e)]);
			if (i > 0) {
				const [px, py] = p[i - 1];
				const ux = Math.sign(ax - px),
					uy = Math.sign(ay - py),
					vx = Math.sign(bx - ax),
					vy = Math.sign(by - ay);
				k.corners.add(`M${n1(ax - ux * r[i])} ${n1(ay - uy * r[i])}Q${n1(ax)} ${n1(ay)} ${n1(ax + vx * r[i])} ${n1(ay + vy * r[i])}`);
			}
		}
	};
	for (const { from, to, cls, arrow } of links) {
		const A = box(from),
			B = box(to);
		const r = A && B && route(A, B);
		if (!r) continue;
		trace(r.pts, cls);
		if (arrow) kinds[cls].heads.add(`M${n1(r.x2 - 6 * r.dir)} ${n1(r.y2 - 4)}L${n1(r.x2)} ${n1(r.y2)}L${n1(r.x2 - 6 * r.dir)} ${n1(r.y2 + 4)}`);
	}
	let out = "";
	for (const cls of KINDS) {
		const k = kinds[cls];
		let d = "";
		for (const [key, spans] of k.runs) {
			const at = key.slice(1);
			spans.sort((a, b) => a[0] - b[0]);
			let [s, e] = spans[0];
			const put = () => {
				if (e - s > 0.25) d += key[0] === "h" ? `M${n1(s)} ${at}H${n1(e)}` : `M${at} ${n1(s)}V${n1(e)}`;
			};
			for (const [a, b] of spans.slice(1)) {
				if (a <= e + 0.5) e = Math.max(e, b);
				else {
					put();
					[s, e] = [a, b];
				}
			}
			put();
		}
		d += [...k.corners].join("");
		if (d) out += `<g class="${cls}"><path d="${d}"/>${[...k.heads].map((h) => `<path class="a" d="${h}"/>`).join("")}</g>`;
	}
	svg.setAttribute("width", String(cols.scrollWidth));
	svg.setAttribute("height", String(cols.scrollHeight));
	svg.setAttribute("viewBox", `0 0 ${cols.scrollWidth} ${cols.scrollHeight}`);
	svg.innerHTML = out;
}
