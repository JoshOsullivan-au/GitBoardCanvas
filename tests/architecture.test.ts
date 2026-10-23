// SPDX-License-Identifier: MIT
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { architectureConfig, DEFAULT_ARCHITECTURE, serverSelector } from "../src/architecture/config.js";
import { cacheReaders } from "../src/architecture/measure.js";
import { assignWaves, endpointOf, readPath, shellEndpoints, type Span } from "../src/architecture/readPath.js";
import { areaOf, liveRoutes, pageRoutes } from "../src/architecture/routes.js";

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
		const { server, calls } = readPath([proxy, proxyCall, web, webCall], new Set(), "web");
		expect(server?.service).toBe("web");
		expect(calls.map((c) => [c.endpoint, c.startMs])).toEqual([["table brands", 20]]);
	});

	it("names Supabase, provider and Redis calls with ids folded", () => {
		const u = "https://abc.supabase.co";
		expect(endpointOf(call(`${u}/rest/v1/rpc/permit`, 0, 1))).toMatchObject({ endpoint: "rpc permit", target: "rpc" });
		expect(endpointOf(call(`${u}/rest/v1/brands?id=eq.1`, 0, 1))).toMatchObject({ endpoint: "table brands", target: "table" });
		expect(endpointOf(call(`${u}/auth/v1/admin/users/cc4a9a0a-8716-46b5-bde3-289f0c7f061a`, 0, 1))).toMatchObject({ endpoint: "auth admin/users/{id}", target: "auth" });
		expect(endpointOf(call("https://graph.facebook.com/v26.0/act_1988159488105605/campaigns", 0, 1))).toMatchObject({ endpoint: "graph.facebook.com /act_{id}/campaigns", target: "provider" });
		expect(endpointOf(call("https://graph.facebook.com/v26.0/120254380261740007/adsets", 0, 1))?.endpoint).toBe("graph.facebook.com /{id}/adsets");
		expect(endpointOf(span({ kind: "SPAN_KIND_CLIENT", name: "redis GET channel" }))).toMatchObject({ target: "redis" });
		expect(endpointOf(span({ name: "render route" }))).toBeNull();
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
