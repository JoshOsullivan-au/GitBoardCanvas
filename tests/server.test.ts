// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ARCHITECTURE } from "../src/architecture/config.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { statusSettled } from "../src/pipeline.js";
import { clientMessage, createBoardServer } from "../src/server.js";
import { fakeGh, prRow } from "./fake-gh.js";

let dir: string;
let server: http.Server;
let port: number;
let close: () => void;

function request(
	pathname: string,
	opts: { method?: string; host?: string; origin?: string; type?: string; body?: string } = {},
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const headers: Record<string, string> = { host: opts.host ?? `127.0.0.1:${port}` };
		if (opts.origin) headers.origin = opts.origin;
		if (opts.type) headers["content-type"] = opts.type;
		const req = http.request({ host: "127.0.0.1", port, path: pathname, method: opts.method ?? "GET", headers }, (res) => {
			let body = "";
			res.on("data", (c) => (body += c));
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
		});
		req.on("error", reject);
		if (opts.body) req.write(opts.body);
		req.end();
	});
}

beforeAll(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-server-"));
	const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
	g("init", "-q", "-b", "main");
	g("config", "user.email", "test@example.com");
	g("config", "user.name", "Test");
	g("config", "commit.gpgsign", "false");
	for (const s of DEFAULT_CONFIG.stages) fs.mkdirSync(path.join(dir, "roadmap", s.folder), { recursive: true });
	fs.writeFileSync(
		path.join(dir, "roadmap/3.open/checkout-redesign.md"),
		"# Checkout redesign\n\n- [ ] one\n- [x] two\n\n<script>alert(1)</script>\n",
	);
	fs.writeFileSync(path.join(dir, "secret.md"), "# outside\n");
	g("add", "-A");
	g("commit", "-q", "-m", "init");
	port = 40000 + Math.floor(Math.random() * 20000);
	const board = createBoardServer({ root: dir, config: { ...DEFAULT_CONFIG, github: false }, port, refreshMs: 0, log: () => {} });
	await board.refresh();
	close = board.close;
	server = http.createServer(board.handle);
	await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
});

afterAll(() => {
	close();
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("board server", () => {
	it("serves the page with icons injected", async () => {
		const res = await request("/");
		expect(res.status).toBe(200);
		expect(res.body).not.toContain("__ICONS__");
		expect(res.body).toContain("GitBoard Canvas");
	});

	it("serves the board", async () => {
		const res = await request("/api/board");
		expect(res.status).toBe(200);
		const board = JSON.parse(res.body);
		expect(board.cards.map((c: { slug: string }) => c.slug)).toEqual(["checkout-redesign"]);
		expect(board.stages).toHaveLength(5);
	});

	it("refuses a foreign Host (DNS rebinding)", async () => {
		expect((await request("/api/board", { host: `evil.example:${port}` })).status).toBe(403);
	});

	it("refuses a cross-origin write", async () => {
		const res = await request("/api/plan", { method: "POST", origin: "http://evil.example", type: "application/json", body: "{}" });
		expect(res.status).toBe(403);
	});

	it("answers 413 for a big body, 400 for bad JSON and 415 for other types, without a stack", async () => {
		const origin = `http://127.0.0.1:${port}`;
		const big = await request("/api/plan", { method: "POST", origin, type: "application/json", body: "x".repeat(20_000) });
		expect(big.status).toBe(413);
		const bad = await request("/api/plan", { method: "POST", origin, type: "application/json", body: "{nope" });
		expect(bad.status).toBe(400);
		expect(bad.body).not.toMatch(/at .+\.ts/);
		const wrong = await request("/api/plan", { method: "POST", origin, type: "text/plain", body: "{}" });
		expect(wrong.status).toBe(415);
		const notMove = await request("/api/plan", { method: "POST", origin, type: "application/json", body: '{"slug":"x","from":1,"to":9}' });
		expect(notMove.status).toBe(400);
	});

	it("plans a move", async () => {
		const res = await request("/api/plan", {
			method: "POST",
			origin: `http://127.0.0.1:${port}`,
			type: "application/json",
			body: JSON.stringify({ slug: "checkout-redesign", from: 3, to: 4 }),
		});
		expect(res.status).toBe(200);
		expect(JSON.parse(res.body).blocked).toBeNull();
	});

	it("renders a lifecycle doc with raw HTML escaped, and refuses paths outside it", async () => {
		const ok = await request(`/api/doc?path=${encodeURIComponent("roadmap/3.open/checkout-redesign.md")}`);
		expect(ok.status).toBe(200);
		expect(ok.body).not.toContain("<script>");
		for (const p of ["secret.md", "roadmap/../secret.md", "roadmap/3.open/../../secret.md", "/etc/passwd"]) {
			expect((await request(`/api/doc?path=${encodeURIComponent(p)}`)).status).toBe(404);
		}
	});
});

describe("architecture", () => {
	it("hides the tab and answers 404 when the config has no architecture block", async () => {
		expect((await request("/")).body).toContain("const ARCHITECTURE = false;");
		const res = await request("/api/architecture");
		expect(res.status).toBe(404);
		expect(JSON.parse(res.body).error).toBe("No architecture block in gitboard.config.json.");
	});

	it("serves the data file, 404 before the first measure, and refuses a foreign Host", async () => {
		const archPort = port + 1;
		const calls = [{ target: "sql", kind: "database" as const, group: "Queries", span: "pg " }];
		const architecture = { ...DEFAULT_ARCHITECTURE, data: "maps/live.json", calls };
		const arch = createBoardServer({ root: dir, config: { ...DEFAULT_CONFIG, github: false, architecture }, port: archPort, refreshMs: 0, log: () => {} });
		const archServer = http.createServer(arch.handle);
		await new Promise<void>((resolve) => archServer.listen(archPort, "127.0.0.1", resolve));
		const get = (pathname: string, host = `127.0.0.1:${archPort}`) =>
			new Promise<{ status: number; body: string }>((resolve, reject) => {
				http
					.get({ host: "127.0.0.1", port: archPort, path: pathname, headers: { host } }, (res) => {
						let body = "";
						res.on("data", (c) => (body += c));
						res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
					})
					.on("error", reject);
			});
		try {
			expect((await get("/")).body).toContain("const ARCHITECTURE = true;");
			const none = await get("/api/architecture");
			expect(none.status).toBe(404);
			expect(JSON.parse(none.body).error).toBe("No measure yet: run gitboard measure --from <iso>.");
			fs.mkdirSync(path.join(dir, "maps"), { recursive: true });
			fs.writeFileSync(path.join(dir, "maps/live.json"), JSON.stringify({ areas: [], routes: [{ route: "/" }] }));
			const ok = await get("/api/architecture");
			expect(ok.status).toBe(200);
			expect(JSON.parse(ok.body).routes[0].route).toBe("/");
			// A file from before `targets` gets them from the config's rules; a file with its own keeps them.
			expect(Object.keys(JSON.parse(ok.body).targets)).toEqual(["sql", "provider"]);
			expect(JSON.parse(ok.body).targets.sql).toMatchObject({ kind: "database", group: "Queries" });
			const own = { format: 2, areas: [], routes: [], targets: { kv: { kind: "cache", group: "KV", label: "KV", icon: null, prefix: "" } } };
			fs.writeFileSync(path.join(dir, "maps/live.json"), JSON.stringify(own));
			expect(JSON.parse((await get("/api/architecture")).body)).toEqual(own);
			expect((await get("/api/architecture", `evil.example:${archPort}`)).status).toBe(403);
			fs.writeFileSync(path.join(dir, "maps/live.json"), "{ not json");
			const bad = await get("/api/architecture");
			expect(bad.status).toBe(500);
			expect(JSON.parse(bad.body).error).toBe("maps/live.json is not a measure: run gitboard measure again.");
			fs.writeFileSync(path.join(dir, "maps/live.json"), JSON.stringify({ routes: "x" }));
			expect((await get("/api/architecture")).status).toBe(500);
		} finally {
			arch.close();
			archServer.close();
		}
	});
});

describe("pull request status", () => {
	/** A one-feature repo served with GitHub on; returns the board JSON. */
	async function boardWithGh(): Promise<{ github: boolean | null; cards: { slug: string; git: { branch: string; pr: unknown }[] }[] }> {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-server-gh-"));
		const g = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
		g("init", "-q", "-b", "main");
		fs.mkdirSync(path.join(root, "roadmap/3.open"), { recursive: true });
		fs.writeFileSync(path.join(root, "roadmap/3.open/checkout-redesign.md"), "# Checkout redesign\n\n- [ ] one\n");
		fs.writeFileSync(path.join(root, "roadmap/3.open/search-filters.md"), "# Search filters\n\n- [ ] one\n");
		g("add", "-A");
		g("-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
		let handle: http.RequestListener = (_req, res) => res.end();
		const srv = http.createServer((req, res) => handle(req, res));
		await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
		const ghPort = (srv.address() as { port: number }).port;
		const board = createBoardServer({ root, config: { ...DEFAULT_CONFIG, github: true }, port: ghPort, refreshMs: 0, log: () => {} });
		handle = board.handle;
		await board.refresh();
		// Status is read in the background; the next refresh merges it.
		await statusSettled(root);
		await board.refresh();
		try {
			const body = await new Promise<string>((resolve, reject) => {
				http
					.get({ host: "127.0.0.1", port: ghPort, path: "/api/board", headers: { host: `127.0.0.1:${ghPort}` } }, (res) => {
						let b = "";
						res.on("data", (c) => (b += c));
						res.on("end", () => resolve(b));
					})
					.on("error", reject);
			});
			return JSON.parse(body);
		} finally {
			board.close();
			srv.close();
			fs.rmSync(root, { recursive: true, force: true });
		}
	}

	it("serves checks, review and conflicts on the card's pull request", async () => {
		const gh = fakeGh();
		try {
			gh.prs([
				prRow({
					number: 4,
					headRefName: "feature/checkout-redesign",
					checkState: "FAILURE",
					reviewDecision: "REVIEW_REQUIRED",
					mergeable: "CONFLICTING",
				}),
				prRow({
					number: 5,
					url: "https://github.example/o/r/pull/5",
					headRefName: "feature/search-filters",
					isDraft: true,
					checkState: "PENDING",
					reviewDecision: "APPROVED",
					mergeable: "UNKNOWN",
				}),
			]);
			const board = await boardWithGh();
			expect(board.github).toBe(true);
			const card = board.cards.find((c) => c.slug === "checkout-redesign");
			expect(card?.git).toEqual([
				expect.objectContaining({
					branch: "feature/checkout-redesign",
					pr: { number: 4, url: "https://github.example/o/r/pull/1", draft: false, title: "A change", checks: "fail", review: "required", conflicts: true },
				}),
			]);
			expect(board.cards.find((c) => c.slug === "search-filters")?.git[0].pr).toEqual({
				number: 5,
				url: "https://github.example/o/r/pull/5",
				draft: true,
				title: "A change",
				checks: "pending",
				review: "approved",
				conflicts: false,
			});
		} finally {
			gh.restore();
		}
	});

	it("says Missing GitHub, not no pull requests, when gh fails", async () => {
		const gh = fakeGh();
		try {
			gh.fail(true);
			const board = await boardWithGh();
			expect(board.github).toBe(false);
			for (const c of board.cards) expect(c.git).toEqual([]);
			expect(gh.calls().length).toBeGreaterThan(0);
		} finally {
			gh.restore();
		}
	});
});

describe("clientMessage", () => {
	it("drops stack frames and caps the length", () => {
		expect(clientMessage("boom\n    at run (file.js:1:2)\n  at next (x.js:3:4)\nafter")).toBe("boom\nafter");
		expect(clientMessage("x".repeat(5000))).toHaveLength(2000);
	});
});
