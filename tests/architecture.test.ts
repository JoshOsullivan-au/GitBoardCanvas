// SPDX-License-Identifier: MIT
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { architectureConfig, DEFAULT_ARCHITECTURE, serverSelector } from "../src/architecture/config.js";
import { cacheReaders } from "../src/architecture/measure.js";
import { assignWaves, endpointOf, readPath, shellEndpoints, type Span, targetsOf } from "../src/architecture/readPath.js";
import { areaOf, liveRoutes, pageRoutes } from "../src/architecture/routes.js";

/** The example preset in the docs: a repo that copies it gets the map the tab drew before call rules were config. */
const PRESET = architectureConfig(JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../docs/presets/supabase-vercel-redis.json"), "utf8")));

function tree(files: Record<string, string>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "arch-map-"));
	for (const [rel, body] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), body);
	}
	return root;
}

const PAGES = {
	"app/(app)/page.tsx": "",
	"app/(app)/home/page.tsx": "",
	"app/(app)/day/[level]/[id]/page.tsx": "",
	"app/(app)/suites/finance/page.tsx": "",
	"app/(public)/forms/open/page.tsx": "",
	"app/sign-in/page.tsx": "",
	"app/_parts/page.tsx": "",
	"app/(app)/@modal/home/page.tsx": "",
};

function span(over: Partial<Span>): Span {
	return { service: "web", name: "x", kind: "SPAN_KIND_INTERNAL", id: "s", parent: null, startNs: 0, endNs: 0, attrs: {}, resource: {}, ...over };
}
const ms = (n: number) => n * 1e6;
function call(url: string, start: number, dur: number): Span {
	return span({ kind: "SPAN_KIND_CLIENT", name: `fetch GET ${url}`, startNs: ms(start), endNs: ms(start + dur), attrs: { "http.url": url, "http.method": "GET" } });
}

describe("architecture config", () => {
	it("defaults when the block is missing and overlays the user's keys", () => {
		expect(architectureConfig(undefined)).toEqual(DEFAULT_ARCHITECTURE);
		const c = architectureConfig({ budgetMs: 300, tempo: { datasource: "d", service: "svc" } });
		expect(c.budgetMs).toBe(300);
		expect(c.tempo).toEqual({ datasource: "d", service: "svc", region: null });
	});

	it("reports every problem at once", () => {
		expect(() => architectureConfig({ budgetMs: -1, site: "ftp://x", exclude: ["("], areas: [{ name: "A" }] })).toThrow(
			/budgetMs.*site|site.*budgetMs/,
		);
		try {
			architectureConfig({ budgetMs: -1, site: "ftp://x", exclude: ["("] });
		} catch (error) {
			expect((error as Error).message.split("; ")).toHaveLength(3);
		}
	});

	it("documents the preset file word for word, and the docs example config loads", () => {
		const doc = fs.readFileSync(path.resolve(import.meta.dirname, "../docs/configuration.md"), "utf8");
		const blocks = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]) as { architecture?: Record<string, unknown> }).filter((b) => b.architecture);
		const shown = architectureConfig(blocks.find((b) => b.architecture?.calls && (b.architecture.platform as { database?: string }).database === "Supabase")?.architecture);
		expect({ calls: shown.calls, pathFolds: shown.pathFolds, platform: shown.platform }).toEqual({ calls: PRESET.calls, pathFolds: PRESET.pathFolds, platform: PRESET.platform });
		for (const b of blocks) expect(() => architectureConfig(b.architecture)).not.toThrow();
	});

	it("reads the docs preset and reports every bad call rule, fold and platform key", () => {
		expect(PRESET.calls.map((r) => r.target)).toEqual(["redis", "rpc", "table", "auth", "storage"]);
		expect(PRESET.platform).toMatchObject({ server: "Vercel", database: "Supabase" });
		expect(architectureConfig({ platform: { database: "Main" } }).platform).toEqual({ ...DEFAULT_ARCHITECTURE.platform, database: "Main" });
		const bad = () =>
			architectureConfig({
				calls: [{ target: "x", kind: "queue", host: "h" }, { target: "provider", kind: "cache", span: "q " }, { target: "y", kind: "database" }, { target: "z", kind: "provider", path: "api/" }],
				pathFolds: [{ match: "(", replace: "" }],
				platform: { cacheHeaders: "x-cache", server: "" },
				pagesCommand: " ",
			});
		expect(() => architectureConfig({ calls: [{ target: "a", kind: "cache", host: "https://API.example.com" }, { target: "a", kind: "database", span: "q" }, { target: "__proto__", kind: "cache", span: "x" }] })).toThrow(
			/calls\[0\]\.host must be a lower-case host name.*target "a" has two kinds|target "a" has two kinds.*calls\[0\]\.host/,
		);
		expect(() => architectureConfig({ calls: [{ target: "__proto__", kind: "cache", span: "x" }] })).toThrow(/cannot be __proto__/);
		expect(bad).toThrow(/pagesCommand must be a command or null/);
		expect(bad).toThrow(/calls\[0\]\.kind must be one of database, cache, provider/);
		expect(bad).toThrow(/calls\[1\]\.target "provider" is kept for calls no rule matches/);
		expect(bad).toThrow(/calls\[2\] needs host, path or span/);
		expect(bad).toThrow(/calls\[3\]\.path must start with \//);
		expect(bad).toThrow(/pathFolds has an invalid pattern: \(/);
		expect(bad).toThrow(/platform\.cacheHeaders must be an array/);
		expect(bad).toThrow(/platform\.server must be a name or null/);
	});

	it("builds the server selector with and without a region", () => {
		const base = { ...DEFAULT_ARCHITECTURE, tempo: { datasource: "d", service: "web-app", region: "sin1" } };
		expect(serverSelector(base)).toBe('{ resource.service.name = "web-app" && resource.cloud.region = "sin1" && kind = server && name =~ "GET /.*" }');
		expect(serverSelector({ ...base, tempo: { ...base.tempo, region: null } })).toBe('{ resource.service.name = "web-app" && kind = server && name =~ "GET /.*" }');
	});
});

describe("live routes", () => {
	it("reads app router pages without route groups, slots or private folders", () => {
		const root = tree(PAGES);
		expect(pageRoutes(root, "app").map((r) => r.route)).toEqual(["/", "/day/[level]/[id]", "/forms/open", "/home", "/sign-in", "/suites/finance"]);
	});

	it("skips intercepting routes, which render another route's URL", () => {
		const root = tree({ "app/feed/page.tsx": "", "app/feed/(.)photo/[id]/page.tsx": "", "app/@modal/(..)photo/[id]/page.tsx": "", "app/(...)login/page.tsx": "", "app/photo/[id]/page.tsx": "" });
		expect(pageRoutes(root, "app").map((r) => r.route)).toEqual(["/feed", "/photo/[id]"]);
	});

	it("drops excluded routes and sorts the rest into areas", () => {
		const root = tree(PAGES);
		const c = architectureConfig({ exclude: ["^/suites/finance(/|$)", "^/forms/"], areas: [{ name: "Day", match: "^/day" }, { name: "Home", match: "^/$|^/home" }], defaultArea: "Public" });
		expect(liveRoutes(root, c).map((r) => [r.route, r.area])).toEqual([
			["/", "Home"],
			["/day/[level]/[id]", "Day"],
			["/home", "Home"],
			["/sign-in", "Public"],
		]);
		expect(areaOf(c, "/anything")).toBe("Public");
	});

	it("lists every page from pagesCommand instead of an app router folder, then filters them", () => {
		const root = tree({ "pages.mjs": 'process.stdout.write(JSON.stringify(["/orders/:id", { route: "/", file: "views/home.py" }, "/admin", "/"]))' });
		const c = architectureConfig({ pagesCommand: "node pages.mjs", exclude: ["^/admin"], areas: [{ name: "Orders", match: "^/orders" }] });
		expect(liveRoutes(root, c)).toEqual([
			{ route: "/", area: "Pages", file: "views/home.py" },
			{ route: "/orders/:id", area: "Orders", file: "" },
		]);
		const wrong = tree({ "pages.mjs": 'process.stdout.write(JSON.stringify(["orders"]))' });
		expect(() => liveRoutes(wrong, architectureConfig({ pagesCommand: "node pages.mjs" }))).toThrow(/pagesCommand must print a JSON array of routes starting with \//);
	});

	it("asks routesCommand which routes are live, giving it every page route on stdin", () => {
		const root = tree({ ...PAGES, "keep.mjs": 'let s="";for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(JSON.parse(s).filter((r)=>!r.startsWith("/suites"))))' });
		const c = architectureConfig({ routesCommand: "node keep.mjs", exclude: ["^/home"] });
		expect(liveRoutes(root, c).map((r) => r.route)).toEqual(["/", "/day/[level]/[id]", "/forms/open", "/home", "/sign-in"]);
	});
});

describe("read path", () => {
	it("reads the calls of the named service's server span, not an upstream one listed first", () => {
		const proxy = span({ service: "edge", kind: "SPAN_KIND_SERVER", name: "GET /x", startNs: ms(0), endNs: ms(600) });
		const proxyCall = { ...call("https://a.supabase.co/rest/v1/rpc/edge_only", 5, 10), service: "edge" };
		const web = span({ service: "web", kind: "SPAN_KIND_SERVER", name: "GET /x", startNs: ms(100), endNs: ms(400) });
		const webCall = { ...call("https://a.supabase.co/rest/v1/brands", 120, 30), service: "web" };
		const { server, calls } = readPath([proxy, proxyCall, web, webCall], new Set(), "web", PRESET.calls, PRESET.pathFolds);
		expect(server?.service).toBe("web");
		expect(calls.map((c) => [c.endpoint, c.startMs])).toEqual([["table brands", 20]]);
	});

	it("names the preset's database, provider and cache calls with ids folded", () => {
		const u = "https://abc.supabase.co";
		const of = (s: Span) => endpointOf(s, PRESET.calls, PRESET.pathFolds);
		expect(of(call(`${u}/rest/v1/rpc/permit`, 0, 1))).toMatchObject({ endpoint: "rpc permit", target: "rpc" });
		expect(of(call(`${u}/rest/v1/brands?id=eq.1`, 0, 1))).toMatchObject({ endpoint: "table brands", target: "table" });
		expect(of(call(`${u}/auth/v1/admin/users/cc4a9a0a-8716-46b5-bde3-289f0c7f061a`, 0, 1))).toMatchObject({ endpoint: "auth admin/users/{id}", target: "auth" });
		expect(of(call(`${u}/storage/v1/object/public/logos/a.png`, 0, 1))).toMatchObject({ endpoint: "storage object", target: "storage" });
		expect(of(call(`${u}/functions/v1/sync`, 0, 1))).toMatchObject({ endpoint: "abc.supabase.co /functions/sync", target: "provider" });
		expect(of(call("https://graph.facebook.com/v26.0/act_1988159488105605/campaigns", 0, 1))).toMatchObject({ endpoint: "graph.facebook.com /act_{id}/campaigns", target: "provider" });
		expect(of(call("https://graph.facebook.com/v26.0/120254380261740007/adsets", 0, 1))?.endpoint).toBe("graph.facebook.com /{id}/adsets");
		expect(of(span({ kind: "SPAN_KIND_CLIENT", name: "redis GET channel" }))).toMatchObject({ endpoint: "redis GET channel", target: "redis", method: "GET" });
		expect(of(span({ name: "render route" }))).toBeNull();
	});

	it("names calls as the built-in rules before it did, apart from three listed folds", () => {
		const u = "https://abc.supabase.co";
		const of = (s: Span) => endpointOf(s, PRESET.calls, PRESET.pathFolds);
		// Endpoints the classifier at 912a740 gave for these URLs, before the rules moved into config.
		const before: [string, string, string][] = [
			[`${u}/rest/v1/`, "table ", "table"],
			[`${u}/auth/v1/user`, "auth user", "auth"],
			[`${u}/graphql/v1`, "abc.supabase.co /graphql/v1", "provider"],
			["https://graph.facebook.com/me", "graph.facebook.com /me", "provider"],
			["https://example.com/v2.1/items/1234567", "example.com /items/{id}", "provider"],
			["http://localhost:3000/api/x", "localhost /api/x", "provider"],
			["https://supabase.co.evil.com/rest/v1/rpc/x", "supabase.co.evil.com /rest/rpc/x", "provider"],
		];
		for (const [url, endpoint, target] of before) expect(of(call(url, 0, 1)), url).toMatchObject({ endpoint, target });
		expect(of(span({ kind: "SPAN_KIND_CLIENT", name: "redis SET k", attrs: { "http.method": "POST" } }))).toMatchObject({ endpoint: "redis SET k", method: "SET" });
		// Folds now reach database paths and every match; before, these read admin/users/12345678, items/v1/x and /a/v2/b.
		expect(of(call(`${u}/auth/v1/admin/users/12345678`, 0, 1))?.endpoint).toBe("auth admin/users/{id}");
		expect(of(call(`${u}/rest/v1/items/v1/x`, 0, 1))?.endpoint).toBe("table items/x");
		expect(of(call("https://api.x.com/v1/a/v2/b", 0, 1))?.endpoint).toBe("api.x.com /a/b");
	});

	it("fills {first} without a leading slash, and keeps a whole-word template whole on the card", () => {
		const rules = architectureConfig({ calls: [{ target: "api", kind: "provider", host: "api.example.com", endpoint: "api {first}" }, { target: "pay", kind: "provider", host: "pay.example.com", endpoint: "Payments" }] }).calls;
		expect(endpointOf(call("https://api.example.com/orders/7", 0, 1), rules)?.endpoint).toBe("api orders");
		expect(targetsOf(rules).pay.prefix).toBe("");
	});

	it("without rules, names every call with a URL as a provider and drops spans without one", () => {
		expect(endpointOf(call("https://abc.supabase.co/rest/v1/rpc/permit", 0, 1))).toMatchObject({ endpoint: "abc.supabase.co /rest/v1/rpc/permit", target: "provider" });
		expect(endpointOf(call("https://api.example.com/orders/1234567/items", 0, 1))?.endpoint).toBe("api.example.com /orders/{id}/items");
		expect(endpointOf(span({ kind: "SPAN_KIND_CLIENT", name: "pg.query SELECT" }))).toBeNull();
	});

	it("matches a rule on host, path and span name, and fills its endpoint template", () => {
		const rules = architectureConfig({
			calls: [
				{ target: "sql", kind: "database", span: "pg.query ", endpoint: "sql {name}" },
				{ target: "orders", kind: "database", group: "Orders API", host: "*.db.example.com", path: "/v2/", endpoint: "{first} via {host}" },
				{ target: "kv", kind: "cache", host: "kv.example.com" },
			],
			pathFolds: [{ match: "/tenant-\\w+", replace: "/tenant-{id}" }],
		});
		const of = (s: Span) => endpointOf(s, rules.calls, rules.pathFolds);
		expect(of(span({ kind: "SPAN_KIND_CLIENT", name: "pg.query SELECT" }))).toMatchObject({ endpoint: "sql pg.query SELECT", target: "sql" });
		expect(of(call("https://eu.db.example.com/v2/orders/42", 0, 1))).toMatchObject({ endpoint: "orders via eu.db.example.com", target: "orders" });
		expect(of(call("https://db.example.com/v2/orders", 0, 1))).toMatchObject({ target: "provider" });
		expect(of(call("https://kv.example.com/tenant-acme/get", 0, 1))).toMatchObject({ endpoint: "kv.example.com /tenant-{id}/get", target: "kv" });
		expect(targetsOf(rules.calls)).toEqual({
			sql: { kind: "database", group: "sql", label: "sql", icon: null, prefix: "sql " },
			orders: { kind: "database", group: "Orders API", label: "orders", icon: null, prefix: "" },
			kv: { kind: "cache", group: "kv", label: "kv", icon: null, prefix: "" },
			provider: { kind: "provider", group: "Providers", label: "Provider", icon: null, prefix: "" },
		});
	});

	it("opens a new wave only when a call starts after one of the current wave finished", () => {
		const waves = assignWaves([
			{ startMs: 8, durMs: 24 },
			{ startMs: 32, durMs: 145 },
			{ startMs: 33, durMs: 120 },
			{ startMs: 233, durMs: 70 },
			{ startMs: 249, durMs: 74 },
		]).map((c) => c.wave);
		expect(waves).toEqual([1, 2, 2, 3, 3]);
	});

	it("counts an endpoint as the shell's when nearly every request with calls makes it", () => {
		const reqs = [[{ endpoint: "a" }, { endpoint: "b" }], [{ endpoint: "a" }], [{ endpoint: "a" }, { endpoint: "c" }], []];
		expect([...shellEndpoints(reqs, 0.9)]).toEqual(["a"]);
	});

	it("keeps only the server's own calls, the first of a shell endpoint as the shell's and the rest as the page's", () => {
		const server = span({ service: "web", kind: "SPAN_KIND_SERVER", name: "GET /x", startNs: ms(100), endNs: ms(500) });
		const browser = span({ ...call("https://site.test/x", 50, 400), service: "browser" });
		const own = (url: string, start: number, dur: number) => ({ ...call(url, start, dur), service: "web" });
		const { calls } = readPath(
			[server, browser, own("https://a.supabase.co/rest/v1/rpc/permit", 110, 20), own("https://a.supabase.co/rest/v1/rpc/permit", 140, 20), own("https://a.supabase.co/rest/v1/brands", 112, 30)],
			new Set(["rpc permit"]),
			undefined,
			PRESET.calls,
		);
		expect(calls.map((c) => [c.endpoint, c.origin, c.wave, c.startMs])).toEqual([
			["rpc permit", "shell", 1, 10],
			["table brands", "page", 1, 12],
			["rpc permit", "page", 2, 40],
		]);
	});
});

describe("cache readers", () => {
	it("lists files that call the reader, not the file that defines it or its tests", () => {
		const root = tree({
			"lib/redis/cache.ts": "export async function cachedRead() {}",
			"lib/day.ts": 'import { cachedRead } from "./redis/cache";\nawait cachedRead();',
			"lib/day.test.ts": "cachedRead()",
			"app/page.tsx": "nothing here",
		});
		const c = architectureConfig({ cache: { name: "Cache", reader: "cachedRead", dirs: ["app", "lib"] } });
		expect(cacheReaders(root, c)).toEqual(["lib/day.ts"]);
	});
});
