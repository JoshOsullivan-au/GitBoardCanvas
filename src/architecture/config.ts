// SPDX-License-Identifier: MIT
// The Architecture tab's settings: the `architecture` block of gitboard.config.json. It imports nothing from the
// host app, so any repo with a Next.js app router and Tempo traces can use it.

/** A route area on the Pages column: first match on the route wins (JavaScript regex source, case-insensitive). */
export type AreaRule = { name: string; match: string; icon?: string };

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
	/** Display names for provider hosts, for example `{ "graph.facebook.com": "Meta" }`. */
	providers: Record<string, string>;
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
	routesCommand: null,
	areas: [],
	defaultArea: "Pages",
	tempo: { datasource: "", service: "", region: null },
	shellShare: 0.9,
	access: [],
	providers: {},
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
	} as ArchitectureConfig;
	if (typeof c.site !== "string" || (c.site && !/^https?:\/\/[^/]+$/.test(c.site))) e.push("architecture.site must be an origin like https://example.com");
	if (!Number.isInteger(c.budgetMs) || c.budgetMs <= 0) e.push("architecture.budgetMs must be a positive whole number");
	if (typeof c.appDir !== "string" || !c.appDir || c.appDir.startsWith("/") || c.appDir.split(/[\\/]/).includes("..")) e.push("architecture.appDir must be a repo-relative folder");
	if (!isStrings(c.exclude)) e.push("architecture.exclude must be an array of strings");
	else for (const p of c.exclude) try { new RegExp(p); } catch { e.push(`architecture.exclude has an invalid pattern: ${p}`); }
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
	if (c.cache !== null && !(isObject(c.cache) && typeof c.cache.name === "string" && typeof c.cache.reader === "string" && isStrings(c.cache.dirs)))
		e.push('architecture.cache must be null or { "name": string, "reader": string, "dirs": string[] }');
	if (typeof c.data !== "string" || !c.data || c.data.startsWith("/") || c.data.split(/[\\/]/).includes("..")) e.push("architecture.data must be a repo-relative file");
	if (e.length) throw new Error(e.join("; "));
	return c;
}

/** The TraceQL selector for the server's page requests. */
export function serverSelector(c: ArchitectureConfig): string {
	const parts = [`resource.service.name = "${c.tempo.service}"`];
	if (c.tempo.region) parts.push(`resource.cloud.region = "${c.tempo.region}"`);
	parts.push("kind = server", 'name =~ "GET /.*"');
	return `{ ${parts.join(" && ")} }`;
}
