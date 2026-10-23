// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ARCHITECTURE } from "../src/architecture/config.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { clientMessage, createBoardServer } from "../src/server.js";

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
		const architecture = { ...DEFAULT_ARCHITECTURE, data: "maps/live.json" };
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
			fs.writeFileSync(path.join(dir, "maps/live.json"), JSON.stringify({ routes: [{ route: "/" }] }));
			const ok = await get("/api/architecture");
			expect(ok.status).toBe(200);
			expect(JSON.parse(ok.body).routes[0].route).toBe("/");
			expect((await get("/api/architecture", `evil.example:${archPort}`)).status).toBe(403);
		} finally {
			arch.close();
			archServer.close();
		}
	});
});

describe("clientMessage", () => {
	it("drops stack frames and caps the length", () => {
		expect(clientMessage("boom\n    at run (file.js:1:2)\n  at next (x.js:3:4)\nafter")).toBe("boom\nafter");
		expect(clientMessage("x".repeat(5000))).toHaveLength(2000);
	});
});
