// SPDX-License-Identifier: MIT
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The built CLI, as installed users run it. `npm ci` builds it through `prepare`.
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
/** The example preset in the docs, whose rules name the fake trace's call `rpc permit`. */
const PRESET = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "presets", "supabase-vercel-redis.json"), "utf8"));
const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

let root: string;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-cli-")));
	sh(root, "init", "-q", "-b", "main");
	sh(root, "config", "user.email", "t@example.com");
	sh(root, "config", "user.name", "Test");
	sh(root, "config", "commit.gpgsign", "false");
	for (const s of ["1.ideas", "2.planning", "3.open", "4.in-progress", "5.complete"]) {
		fs.mkdirSync(path.join(root, "roadmap", s), { recursive: true });
		fs.writeFileSync(path.join(root, "roadmap", s, "README.md"), "# Stage\n");
	}
	// Enough features that `list --json` is far past the 64 KiB a pipe holds at once.
	for (let i = 0; i < 300; i++) {
		const open = Array.from({ length: 4 }, (_, n) => `- [ ] Step ${n + 1} of feature ${i}, written long enough to fill the pipe`).join("\n");
		fs.writeFileSync(path.join(root, "roadmap", "3.open", `feature-${i}.md`), `# Feature ${i}\n\n${open}\n`);
	}
	sh(root, "add", "-A");
	sh(root, "commit", "-q", "-m", "init");
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe("cli", () => {
	it("writes the whole of list --json to a pipe before it exits", () => {
		expect(fs.existsSync(CLI), "run npm run build first").toBe(true);
		const out = spawnSync(process.execPath, [CLI, "list", "--json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
		expect(out.status).toBe(0);
		expect(Buffer.byteLength(out.stdout)).toBeGreaterThan(64 * 1024);
		const board = JSON.parse(out.stdout) as { cards: unknown[] };
		expect(board.cards).toHaveLength(300);
	});
});

/** A stand-in for Grafana's `gcx` CLI: two page requests for `/` in Tempo, each with one Supabase call. */
function fakeGcx(bin: string): void {
	const attr = (key: string, v: string | number) => ({ key, value: typeof v === "number" ? { intValue: String(v) } : { stringValue: v } });
	const ms = (n: number) => String(n * 1e6);
	const trace = (server: [number, number], call: [number, number]) => ({
		trace: {
			resourceSpans: [
				{
					resource: { attributes: [attr("service.name", "web")] },
					scopeSpans: [
						{
							spans: [
								{ spanId: "s", name: "GET /", kind: "SPAN_KIND_SERVER", startTimeUnixNano: ms(server[0]), endTimeUnixNano: ms(server[1]), attributes: [attr("http.target", "/"), attr("http.status_code", 200)] },
								{ spanId: "c", parentSpanId: "s", name: "fetch POST", kind: "SPAN_KIND_CLIENT", startTimeUnixNano: ms(call[0]), endTimeUnixNano: ms(call[1]), attributes: [attr("http.url", "https://abc.supabase.co/rest/v1/rpc/permit"), attr("http.method", "POST")] },
							],
						},
					],
				},
			],
		},
	});
	const answers = {
		query: { traces: [{ traceID: "t1" }, { traceID: "t2" }] },
		t1: trace([1000, 1400], [1010, 1030]),
		t2: trace([5000, 5180], [5010, 5030]),
		avg: { series: [{ labels: [{ key: "name", value: { stringValue: "GET /" } }], value: 0.29 }] },
		count: { series: [{ labels: [{ key: "name", value: { stringValue: "GET /" } }], value: 2 }] },
	};
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(
		path.join(bin, "gcx"),
		`#!${process.execPath}
const a = process.argv.slice(2), answers = ${JSON.stringify(answers)};
const out = a[1] === "query" ? answers.query : a[1] === "get" ? answers[a[2]] : a[2].includes("avg_over_time") ? answers.avg : answers.count;
process.stdout.write('{"class":"hint","text":"agent hint"}\\n' + JSON.stringify(out));
`,
		{ mode: 0o755 },
	);
}

describe("cli measure", () => {
	const run = (...args: string[]) =>
		spawnSync(process.execPath, [CLI, "measure", ...args], {
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, PATH: `${path.join(root, ".bin")}${path.delimiter}${process.env.PATH}` },
		});
	const configure = (architecture: unknown) => fs.writeFileSync(path.join(root, "gitboard.config.json"), JSON.stringify({ architecture }));

	it("refuses without an architecture block", () => {
		const out = run("--from", "2026-10-23T00:00:00Z");
		expect(out.status).toBe(1);
		expect(out.stderr).toContain("no architecture block in gitboard.config.json");
	});

	it("needs --from", () => {
		configure({ tempo: { datasource: "d", service: "web" } });
		const out = run();
		expect(out.status).toBe(1);
		expect(out.stderr).toContain("Usage: gitboard measure --from <iso> [--to <iso>]");
	});

	it("reads every live route from Tempo and writes the data file", () => {
		for (const page of ["app/page.tsx", "app/home/page.tsx"]) {
			fs.mkdirSync(path.dirname(path.join(root, page)), { recursive: true });
			fs.writeFileSync(path.join(root, page), "");
		}
		fakeGcx(path.join(root, ".bin"));
		configure({ ...PRESET, tempo: { datasource: "d", service: "web" }, budgetMs: 200 });
		const out = run("--from", "2026-10-23T00:00:00Z", "--to", "2026-10-23T01:00:00Z");
		expect(out.stderr).toContain("1 of 2 live routes measured, 1 with no request; wrote .gitboard/architecture.json");
		expect(out.status).toBe(0);
		const map = JSON.parse(fs.readFileSync(path.join(root, ".gitboard/architecture.json"), "utf8"));
		expect(map.window).toEqual({ from: "2026-10-23T00:00:00Z", to: "2026-10-23T01:00:00Z" });
		expect(map.shell).toEqual(["rpc permit"]);
		const [home, slash] = [map.routes.find((r: { route: string }) => r.route === "/home"), map.routes.find((r: { route: string }) => r.route === "/")];
		expect(home).toMatchObject({ samples: [], noRequest: "No request in the window", count: 0 });
		expect(slash).toMatchObject({ avgMs: 290, count: 2 });
		expect(slash.samples[0]).toMatchObject({ sample: "/", status: 200, waves: 1, databaseCalls: 1, warm: { traceId: "t2", serverMs: 180 }, cold: { traceId: "t1", serverMs: 400 } });
		expect(slash.samples[0].calls).toEqual([{ endpoint: "rpc permit", target: "rpc", method: "POST", startMs: 10, durMs: 20, wave: 1, origin: "shell" }]);
		expect(map.format).toBe(2);
		expect(map.platform).toEqual({ server: "Vercel", database: "Supabase" });
		expect(map.targets.rpc).toEqual({ kind: "database", group: "RPCs", label: "RPC", icon: "Lightning", prefix: "rpc " });
	});

	it("without call rules, counts the same call as a provider and names no database", () => {
		fs.mkdirSync(path.join(root, "app"), { recursive: true });
		fs.writeFileSync(path.join(root, "app/page.tsx"), "");
		fakeGcx(path.join(root, ".bin"));
		configure({ tempo: { datasource: "d", service: "web" } });
		expect(run("--from", "2026-10-23T00:00:00Z", "--to", "2026-10-23T01:00:00Z").status).toBe(0);
		const map = JSON.parse(fs.readFileSync(path.join(root, ".gitboard/architecture.json"), "utf8"));
		expect(map.platform).toEqual({ server: "web", database: null });
		expect(map.routes[0].samples[0]).toMatchObject({ databaseCalls: 0, calls: [{ endpoint: "abc.supabase.co /rest/v1/rpc/permit", target: "provider" }] });
	});
});

describe("cli measure, a page with no request", () => {
	it("asks the site whether its cache served the page", async () => {
		for (const page of ["app/page.tsx", "app/cached/page.tsx", "app/moved/page.tsx", "app/standard/page.tsx"]) {
			fs.mkdirSync(path.dirname(path.join(root, page)), { recursive: true });
			fs.writeFileSync(path.join(root, page), "");
		}
		fakeGcx(path.join(root, ".bin"));
		const site = http.createServer((req, res) => {
			if (req.url === "/cached") res.writeHead(200, { "x-vercel-cache": "HIT" }).end();
			else if (req.url === "/standard") res.writeHead(200, { "cache-status": "edge; hit" }).end();
			else res.writeHead(307, { location: "/sign-in" }).end();
		});
		await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
		const { port } = site.address() as { port: number };
		fs.writeFileSync(path.join(root, "gitboard.config.json"), JSON.stringify({ architecture: { ...PRESET, site: `http://127.0.0.1:${port}`, tempo: { datasource: "d", service: "web" } } }));
		try {
			const code = await new Promise<number | null>((resolve) => {
				const child = spawn(process.execPath, [CLI, "measure", "--from", "2026-10-23T00:00:00Z", "--to", "2026-10-23T01:00:00Z"], {
					cwd: root,
					env: { ...process.env, PATH: `${path.join(root, ".bin")}${path.delimiter}${process.env.PATH}` },
					stdio: "ignore",
				});
				child.on("exit", resolve);
			});
			expect(code).toBe(0);
		} finally {
			site.close();
		}
		const map = JSON.parse(fs.readFileSync(path.join(root, ".gitboard/architecture.json"), "utf8")) as { routes: { route: string; noRequest: string | null }[] };
		const reason = (route: string) => map.routes.find((r) => r.route === route)?.noRequest;
		expect(reason("/cached")).toBe("Served from the host's cache: no function ran, so Tempo has no server span");
		expect(reason("/moved")).toBe("Answers 307 before the page runs");
		// The preset reads its platform's header first and leaves the standard one out.
		expect(reason("/standard")).toBe("No request in the window");
		expect(reason("/")).toBeNull();
	});
});

describe("cli measure, a gcx failure", () => {
	it("fails at once when a trace id happens to contain 503", () => {
		put503Gcx(path.join(root, ".bin"));
		fs.writeFileSync(path.join(root, "gitboard.config.json"), JSON.stringify({ architecture: { tempo: { datasource: "d", service: "web" } } }));
		const started = Date.now();
		const out = spawnSync(process.execPath, [CLI, "measure", "--from", "2026-10-23T00:00:00Z", "--to", "2026-10-23T01:00:00Z"], {
			cwd: root,
			encoding: "utf8",
			timeout: 20_000,
			env: { ...process.env, PATH: `${path.join(root, ".bin")}${path.delimiter}${process.env.PATH}` },
		});
		expect(Date.now() - started).toBeLessThan(15_000);
		expect(out.status).toBe(1);
		expect(out.stderr).toContain("gcx traces get");
	});
});

/** A gcx whose search finds one trace with 503 inside its id, and whose `traces get` fails with no output. */
function put503Gcx(bin: string): void {
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(
		path.join(bin, "gcx"),
		`#!${process.execPath}
const a = process.argv.slice(2);
if (a[1] === "query") process.stdout.write(JSON.stringify({ traces: [{ traceID: "4f5030aa11bb22cc33dd44ee55ff6677" }] }));
else if (a[1] === "get") process.exit(1);
else process.stdout.write(JSON.stringify({ series: [] }));
`,
		{ mode: 0o755 },
	);
}
