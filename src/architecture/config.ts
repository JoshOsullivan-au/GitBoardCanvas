// SPDX-License-Identifier: MIT
// The Architecture tab's settings: the `architecture` block of gitboard.config.json. It imports nothing from the
// host app and names no vendor: a repo describes its own stack (its call rules, platform and route source) here.

/** A route area on the Pages column: first match on the route wins (JavaScript regex source, case-insensitive). */
export type AreaRule = { name: string; match: string; icon?: string };

/** Which column a call lands in. */
export type CallKind = "database" | "cache" | "provider";
export const CALL_KINDS: readonly CallKind[] = ["database", "cache", "provider"];

/**
 * How to name one kind of outbound call. A client span matches when it meets every condition given: `host` (exact, or
 * `*.example.com` for any subdomain), `path` (a prefix of the URL path) and `span` (a prefix of the span name). The
 * first matching rule wins; a call with a URL that no rule matches is a provider named `{host} {path}`.
 */
export type CallRule = {
	/** Id written on each call, such as `"rpc"`. Rules may share one; the first rule with an id describes it. */
	target: string;
	kind: CallKind;
	/** Group heading in the column, such as `"RPCs"`. Defaults to the label. */
	group?: string;
	/** Singular name in the details, such as `"RPC"`. Defaults to the target. */
	label?: string;
	icon?: string;
	host?: string;
	path?: string;
	span?: string;
	/**
	 * The endpoint name: `{host}`, `{path}` (the URL path), `{rest}` (the path after `path`), `{first}` (the first
	 * segment of `{rest}`) and `{name}` (the span name). Defaults to `{host} {path}` with a URL and `{name}` without.
	 */
	endpoint?: string;
};

/** The target of a call with a URL that no rule matches. */
export const OTHER_TARGET = "provider";

/** A path rewrite applied to `{path}` and `{rest}` before ids are folded: every match of `match` becomes `replace`. */
export type PathFold = { match: string; replace: string };

export type ArchitectureConfig = {
	/** The production site, for the cache check on a route Tempo has no request for. */
	site: string;
	/** Server time a page should come in under. */
	budgetMs: number;
	/** The Next.js app router folder the routes are read from. */
	appDir: string;
	/** Routes production does not serve (JavaScript regex source on the route). */
	exclude: string[];
	/**
	 * A command run at the repo root that prints every page route: a JSON array of route strings or of
	 * `{ "route", "file" }`. When set it replaces reading `appDir`, so an app on any framework can list its routes.
	 */
	pagesCommand: string | null;
	/**
	 * A command run at the repo root that reads every page route (a JSON array) on stdin and prints the routes
	 * production serves. When set it replaces `exclude`, so the host app's own rule decides what is live.
	 */
	routesCommand: string | null;
	areas: AreaRule[];
	defaultArea: string;
	tempo: {
		/** Grafana datasource UID, read through the `gcx` CLI. */
		datasource: string;
		service: string;
		/** `resource.cloud.region` of the server spans, or null for every region. */
		region: string | null;
	};
	/** Share of requests an endpoint must appear on to count as the shell's (the layout every page runs). */
	shellShare: number;
	/** Endpoints shown as access checks, for example `rpc permit`. */
	access: string[];
	/** Display names for provider hosts, for example `{ "api.example.com": "Example" }`. */
	providers: Record<string, string>;
	/** How each outbound call is named and which column it lands in; see `CallRule`. */
	calls: CallRule[];
	/** Path rewrites for endpoint names, such as dropping an API version segment. */
	pathFolds: PathFold[];
	/** Where the server runs and the database behind it, as the column headings name them. */
	platform: {
		/** Name of the server's host, or null for the trace's `cloud.provider`, else the Tempo service. */
		server: string | null;
		/** Name of the database column. */
		database: string;
		/** Resource attributes read for the deployment id, first present wins. */
		deployment: string[];
		/** Response headers read for the host's cache status on a page with no request, first present wins. */
		cacheHeaders: string[];
	};
	/** A cache read helper whose callers the map lists when no request reached the cache, or null. */
	cache: { name: string; reader: string; dirs: string[] } | null;
	/** Repo-relative file the measure writes and the tab reads. */
	data: string;
};

export const DEFAULT_ARCHITECTURE: ArchitectureConfig = {
	site: "",
	budgetMs: 500,
	appDir: "app",
	exclude: [],
	pagesCommand: null,
	routesCommand: null,
	areas: [],
	defaultArea: "Pages",
	tempo: { datasource: "", service: "", region: null },
	shellShare: 0.9,
	access: [],
	providers: {},
	calls: [],
	pathFolds: [],
	platform: { server: null, database: "Database", deployment: ["deployment.id", "service.version"], cacheHeaders: ["cache-status", "x-cache", "cf-cache-status"] },
	cache: null,
	data: ".gitboard/architecture.json",
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Defaults overlaid with the user's block; throws once with every problem found. */
export function architectureConfig(raw: unknown): ArchitectureConfig {
	if (raw === undefined) return DEFAULT_ARCHITECTURE;
	const e: string[] = [];
	if (!isObject(raw)) throw new Error("architecture must be an object");
	const c: ArchitectureConfig = {
		...DEFAULT_ARCHITECTURE,
		...raw,
		tempo: { ...DEFAULT_ARCHITECTURE.tempo, ...(isObject(raw.tempo) ? raw.tempo : {}) },
		platform: { ...DEFAULT_ARCHITECTURE.platform, ...(isObject(raw.platform) ? raw.platform : {}) },
	} as ArchitectureConfig;
	if (typeof c.site !== "string" || (c.site && !/^https?:\/\/[^/]+$/.test(c.site))) e.push("architecture.site must be an origin like https://example.com");
	if (!Number.isInteger(c.budgetMs) || c.budgetMs <= 0) e.push("architecture.budgetMs must be a positive whole number");
	if (typeof c.appDir !== "string" || !c.appDir || c.appDir.startsWith("/") || c.appDir.split(/[\\/]/).includes("..")) e.push("architecture.appDir must be a repo-relative folder");
	if (!isStrings(c.exclude)) e.push("architecture.exclude must be an array of strings");
	else for (const p of c.exclude) try { new RegExp(p); } catch { e.push(`architecture.exclude has an invalid pattern: ${p}`); }
	if (c.pagesCommand !== null && (typeof c.pagesCommand !== "string" || !c.pagesCommand.trim())) e.push("architecture.pagesCommand must be a command or null");
	if (c.routesCommand !== null && typeof c.routesCommand !== "string") e.push("architecture.routesCommand must be a string or null");
	if (!Array.isArray(c.areas) || !c.areas.every((a) => isObject(a) && typeof a.name === "string" && typeof a.match === "string" && (a.icon === undefined || typeof a.icon === "string")))
		e.push('architecture.areas must be [{ "name": string, "match": string, "icon"?: string }]');
	else for (const a of c.areas) try { new RegExp(a.match, "i"); } catch { e.push(`architecture area "${a.name}" has an invalid match pattern`); }
	if (typeof c.defaultArea !== "string" || !c.defaultArea) e.push("architecture.defaultArea must be a name");
	if (typeof c.tempo.datasource !== "string" || typeof c.tempo.service !== "string") e.push("architecture.tempo needs datasource and service strings");
	if (c.tempo.region !== null && typeof c.tempo.region !== "string") e.push("architecture.tempo.region must be a string or null");
	if (typeof c.shellShare !== "number" || c.shellShare <= 0 || c.shellShare > 1) e.push("architecture.shellShare must be above 0 and at most 1");
	if (!isStrings(c.access)) e.push("architecture.access must be an array of strings");
	if (!isObject(c.providers) || !Object.values(c.providers).every((v) => typeof v === "string")) e.push("architecture.providers must map hosts to names");
	if (!Array.isArray(c.calls)) e.push("architecture.calls must be an array of rules");
	else {
		c.calls.forEach((r, i) => e.push(...callRuleProblems(r, i)));
		const kinds = new Map<unknown, unknown>();
		for (const r of c.calls.filter(isObject)) {
			if (kinds.has(r.target) && kinds.get(r.target) !== r.kind) e.push(`architecture.calls: target "${String(r.target)}" has two kinds`);
			kinds.set(r.target, kinds.get(r.target) ?? r.kind);
		}
	}
	if (!Array.isArray(c.pathFolds) || !c.pathFolds.every((f) => isObject(f) && typeof f.match === "string" && typeof f.replace === "string"))
		e.push('architecture.pathFolds must be [{ "match": string, "replace": string }]');
	else for (const f of c.pathFolds) try { new RegExp(f.match, "g"); } catch { e.push(`architecture.pathFolds has an invalid pattern: ${f.match}`); }
	if (isObject(raw.platform) || raw.platform === undefined) {
		const p = c.platform;
		if (p.server !== null && (typeof p.server !== "string" || !p.server)) e.push("architecture.platform.server must be a name or null");
		if (typeof p.database !== "string" || !p.database) e.push("architecture.platform.database must be a name");
		if (!isStrings(p.deployment)) e.push("architecture.platform.deployment must be an array of attribute names");
		if (!isStrings(p.cacheHeaders)) e.push("architecture.platform.cacheHeaders must be an array of header names");
	} else e.push("architecture.platform must be an object");
	if (c.cache !== null && !(isObject(c.cache) && typeof c.cache.name === "string" && typeof c.cache.reader === "string" && isStrings(c.cache.dirs)))
		e.push('architecture.cache must be null or { "name": string, "reader": string, "dirs": string[] }');
	if (typeof c.data !== "string" || !c.data || c.data.startsWith("/") || c.data.split(/[\\/]/).includes("..")) e.push("architecture.data must be a repo-relative file");
	if (e.length) throw new Error(e.join("; "));
	return c;
}

/** Problems with the call rule at `i`, each naming it. */
function callRuleProblems(r: unknown, i: number): string[] {
	const at = `architecture.calls[${i}]`;
	if (!isObject(r)) return [`${at} must be an object`];
	const e: string[] = [];
	if (typeof r.target !== "string" || !r.target) e.push(`${at}.target must be a name`);
	else if (r.target === OTHER_TARGET) e.push(`${at}.target "${OTHER_TARGET}" is kept for calls no rule matches`);
	else if (r.target === "__proto__") e.push(`${at}.target cannot be __proto__`);
	if (!CALL_KINDS.includes(r.kind as CallKind)) e.push(`${at}.kind must be one of ${CALL_KINDS.join(", ")}`);
	for (const key of ["group", "label", "icon", "host", "path", "span", "endpoint"])
		if (r[key] !== undefined && (typeof r[key] !== "string" || !r[key])) e.push(`${at}.${key} must be a non-empty string`);
	if (r.host === undefined && r.path === undefined && r.span === undefined) e.push(`${at} needs host, path or span to match on`);
	if (typeof r.path === "string" && !r.path.startsWith("/")) e.push(`${at}.path must start with /`);
	if (typeof r.host === "string" && !/^(\*\.)?[a-z0-9.-]+$/.test(r.host)) e.push(`${at}.host must be a lower-case host name with no scheme or port, or *.example.com`);
	return e;
}

/** The TraceQL selector for the server's page requests. */
export function serverSelector(c: ArchitectureConfig): string {
	const parts = [`resource.service.name = "${c.tempo.service}"`];
	if (c.tempo.region) parts.push(`resource.cloud.region = "${c.tempo.region}"`);
	parts.push("kind = server", 'name =~ "GET /.*"');
	return `{ ${parts.join(" && ")} }`;
}
