// SPDX-License-Identifier: MIT
// Reads every live route's server requests from Tempo (through the `gcx` CLI) and writes the Architecture tab's data:
// per route the warm server time, its calls and their waves; per area, endpoint and cache what the tab draws.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { linkOnPath } from "../paths.js";
import { type ArchitectureConfig, serverSelector } from "./config.js";
import { type Call, flattenTrace, readPath, shellEndpoints, type Span, type TargetInfo, targetsOf } from "./readPath.js";
import { liveRoutes } from "./routes.js";

const run = promisify(execFile);

/** `gcx traces metrics` refuses windows over 25 h. */
const MAX_WINDOW_MS = 25 * 3600_000;
/** Tempo search returns at most this many traces. */
const SEARCH_LIMIT = 1000;
/**
 * The data file's shape. 2 added `format` and `targets`; a file without `format` is 1, whose calls the server
 * describes from the current config's rules.
 */
export const MEASURE_FORMAT = 2;

export type Sample = {
	sample: string;
	status: number | null;
	warm: { traceId: string; at: string; serverMs: number; middlewareMs: number | null } | null;
	cold: { traceId: string; at: string; serverMs: number } | null;
	calls: Call[];
	waves: number;
	databaseCalls: number;
};

export type RouteFigure = {
	route: string;
	area: string;
	file: string;
	/** Over the whole window, from `avg_over_time(duration)` and `count_over_time()` by name. */
	avgMs: number | null;
	count: number;
	samples: Sample[];
	noRequest: string | null;
};

export type ArchitectureMap = {
	format: number;
	measuredAt: string;
	window: { from: string; to: string };
	deployment: string | null;
	budgetMs: number;
	traceql: string;
	/** Column names: where the server runs (from the trace's resource) and the database behind it, when one was seen. */
	platform: { server: string; database: string | null };
	areas: { name: string; icon: string | null }[];
	shell: string[];
	access: string[];
	providers: Record<string, string>;
	/** How the tab draws each call target: column, group, label, icon. */
	targets: Record<string, TargetInfo>;
	cache: { name: string; reader: string; readers: string[] } | null;
	routes: RouteFigure[];
};

/** gcx with its leading agent hint line dropped; retries while a sleeping Grafana instance wakes (HTTP 503). */
async function gcx(c: ArchitectureConfig, args: string[], tries = 4): Promise<unknown> {
	for (let attempt = 1; ; attempt++) {
		try {
			const { stdout } = await run("gcx", [...args, "-d", c.tempo.datasource, "-o", "json"], { maxBuffer: 256 * 1024 * 1024 });
			return JSON.parse(stdout.split("\n").filter((line) => !line.startsWith('{"class":"hint"')).join("\n"));
		} catch (error) {
			// gcx prints its error JSON on stdout.
			const { stdout = "", stderr = "" } = error as { stdout?: string; stderr?: string };
			const text = `${stderr} ${stdout}`.trim() || String(error);
			// 503 as a whole word: a trace id in the command line can hold those digits.
			if (attempt >= tries || !/\b503\b|loading/i.test(text)) throw new Error(`gcx ${args.slice(0, 2).join(" ")}: ${text}`);
			await new Promise((r) => setTimeout(r, 60_000));
		}
	}
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(size, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]);
			}
		}),
	);
	return out;
}

type Series = { series?: { labels?: { key: string; value: { stringValue?: string } }[]; value?: number }[] };

async function byName(c: ArchitectureConfig, expr: string, from: string, to: string): Promise<Map<string, number>> {
	const doc = (await gcx(c, ["traces", "metrics", `${serverSelector(c)} | ${expr}`, "--from", from, "--to", to, "--instant"])) as Series;
	const out = new Map<string, number>();
	for (const s of doc.series ?? []) {
		const name = s.labels?.find((l) => l.key === "name")?.value.stringValue;
		if (name && typeof s.value === "number") out.set(name, s.value);
	}
	return out;
}

/** Why a live route has no server span: a page the host serves from its cache runs no function. */
async function whyNoRequest(c: ArchitectureConfig, route: string): Promise<string> {
	if (!c.site || /\[/.test(route)) return "No request in the window";
	try {
		const res = await fetch(`${c.site}${route}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10_000) });
		const cache = c.platform.cacheHeaders.map((h) => res.headers.get(h)).find((v) => v !== null);
		if (cache && /hit/i.test(cache)) return "Served from the host's cache: no function ran, so Tempo has no server span";
		if (res.status >= 300 && res.status < 400) return `Answers ${res.status} before the page runs`;
	} catch {
		// Offline: fall through to the plain reason.
	}
	return "No request in the window";
}

/** Source files under the cache's folders that call its read helper. */
export function cacheReaders(root: string, c: ArchitectureConfig): string[] {
	if (!c.cache) return [];
	const reader = new RegExp(`\\b${c.cache.reader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(full);
			} else if (/\.(t|j)sx?$/.test(entry.name) && !/\.test\.(t|j)sx?$/.test(entry.name) && reader.test(fs.readFileSync(full, "utf8"))) {
				out.push(path.relative(root, full).split(path.sep).join("/"));
			}
		}
	};
	for (const dir of c.cache.dirs) if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir));
	// The file that defines the helper is not a reader.
	return out.filter((f) => !new RegExp(`(export\\s+(async\\s+)?function|export\\s+const)\\s+${c.cache?.reader}\\b`).test(fs.readFileSync(path.join(root, f), "utf8"))).sort();
}

const durMs = (s: Span) => Math.round((s.endNs - s.startNs) / 1e6);
const iso = (ns: number) => new Date(Math.round(ns / 1e6)).toISOString();

/**
 * Read every live route's server requests in [from, to] from Tempo. Load each live page twice first: the last
 * request of a route sample is the warm one the tab shows, the first the cold one.
 */
export async function measure(root: string, c: ArchitectureConfig, from: string, to: string): Promise<ArchitectureMap> {
	if (!c.tempo.datasource || !c.tempo.service) throw new Error("architecture.tempo needs datasource and service");
	if (!(Date.parse(to) > Date.parse(from))) throw new Error("--to must be after --from");
	if (Date.parse(to) - Date.parse(from) > MAX_WINDOW_MS) throw new Error("Window over 25 h: Tempo refuses it, split it");
	const selector = serverSelector(c);
	const found = (await gcx(c, ["traces", "query", selector, "--from", from, "--to", to, "--limit", String(SEARCH_LIMIT)])) as { traces?: { traceID: string }[] };
	const ids = (found.traces ?? []).map((t) => t.traceID);
	const traces = await pool(ids, 8, async (id) => ({ id, spans: flattenTrace(await gcx(c, ["traces", "get", id])) }));
	const [avg, count] = await Promise.all([byName(c, "avg_over_time(duration) by (name)", from, to), byName(c, "count_over_time() by (name)", from, to)]);

	const requests = traces
		.map(({ id, spans }) => ({ id, spans, server: spans.find((s) => s.kind === "SPAN_KIND_SERVER" && s.service === c.tempo.service) }))
		.filter((r): r is { id: string; spans: Span[]; server: Span } => Boolean(r.server))
		.sort((a, b) => a.server.startNs - b.server.startNs);
	const read = (spans: Span[], shell: Set<string>) => readPath(spans, shell, c.tempo.service, c.calls, c.pathFolds);
	const targets = targetsOf(c.calls);
	const shell = shellEndpoints(requests.map((r) => read(r.spans, new Set()).calls), c.shellShare);

	const routes: RouteFigure[] = [];
	for (const live of liveRoutes(root, c)) {
		const name = `GET ${live.route}`;
		const mine = requests.filter((r) => r.server.name === name);
		const bySample = new Map<string, typeof mine>();
		for (const r of mine) {
			const sample = String(r.server.attrs["http.target"] ?? r.server.attrs["url.path"] ?? live.route).split("?")[0];
			bySample.set(sample, [...(bySample.get(sample) ?? []), r]);
		}
		const samples: Sample[] = [...bySample].map(([sample, list]) => {
			const warm = list[list.length - 1];
			const cold = list.length > 1 ? list[0] : null;
			const { calls } = read(warm.spans, shell);
			const middleware = warm.spans.find((s) => s.name.startsWith("middleware "));
			return {
				sample,
				status: Number(warm.server.attrs["http.status_code"] ?? warm.server.attrs["http.response.status_code"]) || null,
				warm: { traceId: warm.id, at: iso(warm.server.startNs), serverMs: durMs(warm.server), middlewareMs: middleware ? durMs(middleware) : null },
				cold: cold ? { traceId: cold.id, at: iso(cold.server.startNs), serverMs: durMs(cold.server) } : null,
				calls,
				waves: calls.reduce((n, call) => Math.max(n, call.wave), 0),
				databaseCalls: calls.filter((call) => targets[call.target]?.kind === "database").length,
			};
		});
		routes.push({
			...live,
			avgMs: avg.has(name) ? Math.round((avg.get(name) ?? 0) * 1000) : null,
			count: count.get(name) ?? 0,
			samples,
			noRequest: samples.length ? null : await whyNoRequest(c, live.route),
		});
	}
	const last = requests.at(-1)?.server.resource ?? {};
	const deployment = c.platform.deployment.map((k) => last[k]).find((v) => typeof v === "string");
	const host = c.platform.server ?? (typeof last["cloud.provider"] === "string" ? last["cloud.provider"] : c.tempo.service);
	const database = routes.some((r) => r.samples.some((s) => s.databaseCalls > 0)) ? c.platform.database : null;
	const areaNames = [...new Set([...c.areas.map((a) => a.name), c.defaultArea])].filter((a) => routes.some((r) => r.area === a));
	return {
		format: MEASURE_FORMAT,
		measuredAt: new Date().toISOString(),
		window: { from, to },
		deployment: typeof deployment === "string" ? deployment : null,
		budgetMs: c.budgetMs,
		traceql: selector,
		platform: { server: [host, c.tempo.region].filter(Boolean).join(" "), database },
		areas: areaNames.map((name) => ({ name, icon: c.areas.find((a) => a.name === name)?.icon ?? null })),
		shell: [...shell].sort(),
		access: c.access,
		providers: c.providers,
		targets,
		cache: c.cache ? { name: c.cache.name, reader: c.cache.reader, readers: cacheReaders(root, c) } : null,
		routes,
	};
}

/** Whether `text` is a file `writeMap` wrote: JSON with `routes` and `areas` arrays. */
export function isMeasure(text: string): boolean {
	try {
		const map = JSON.parse(text) as Record<string, unknown>;
		return Array.isArray(map.routes) && Array.isArray(map.areas);
	} catch {
		return false;
	}
}

/**
 * Throws unless `rel` under `root` is free or holds an earlier measure, with no link on its path: the measure never
 * overwrites a file it did not write, and never writes through a link.
 */
export function checkTarget(root: string, rel: string): void {
	const file = path.join(root, rel);
	if (linkOnPath(root, file)) throw new Error(`${rel} is a link or sits under one; point architecture.data at a plain file in the repo`);
	if (fs.existsSync(file) && !isMeasure(fs.readFileSync(file, "utf8")))
		throw new Error(`${rel} is not a measure file; point architecture.data at a new file`);
}

/** Writes beside the target, then renames over it, so a reader sees the old file or the whole new one. */
export function writeMap(root: string, rel: string, map: ArchitectureMap): void {
	checkTarget(root, rel);
	const file = path.join(root, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, `${JSON.stringify(map, null, "\t")}\n`, { flag: "wx" });
		fs.renameSync(tmp, file);
	} catch (error) {
		fs.rmSync(tmp, { force: true });
		throw error;
	}
}
