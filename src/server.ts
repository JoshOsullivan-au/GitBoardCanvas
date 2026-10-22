// SPDX-License-Identifier: MIT
// The board server: serves the page and a JSON API over the main checkout's lifecycle folder, and moves features
// through the move engine. Listens on the loopback addresses only and refuses any other Host or a cross-origin write.
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Marked } from "marked";

import { loadBoard } from "./board.js";
import type { GitBoardConfig } from "./config.js";
import { boardVersion } from "./git.js";
import { moveFeature, planMove } from "./move.js";
import { type Pipeline, readPipeline } from "./pipeline.js";
import type { MoveInput } from "./types.js";

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");
const MAX_BODY = 16 * 1024;

export type BoardServerOptions = {
	/** The main checkout. */
	root: string;
	config: GitBoardConfig;
	port: number;
	/** Log line sink; stderr by default. */
	log?: (line: string) => void;
	/** Background pipeline refresh in ms; 0 turns it off (tests). */
	refreshMs?: number;
};

export type BoardServer = { handle: http.RequestListener; refresh: () => Promise<void>; close: () => void };

const escapeHtml = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** What a client sees of a refusal: no stack frames, at most 2000 characters. The log keeps the full text. */
export function clientMessage(message: string): string {
	return message
		.split("\n")
		.filter((l) => !/^\s+at /.test(l))
		.join("\n")
		.slice(0, 2000);
}

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8"): void {
	res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
	res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) {
				reject(new Error("too large"));
				req.removeAllListeners("data");
				req.resume();
			} else chunks.push(c);
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
			} catch {
				reject(new Error("bad json"));
			}
		});
		req.on("error", reject);
	});
}

/** Builds the request handler. `listen` puts it on both loopbacks. */
export function createBoardServer(opts: BoardServerOptions): BoardServer {
	const { root, config, port } = opts;
	const log = opts.log ?? ((line: string) => console.error(`gitboard: ${line}`));
	const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
	const lifecycle = path.join(root, config.roadmapDir);
	const icons = JSON.stringify(JSON.parse(fs.readFileSync(path.join(UI, "icons.json"), "utf8"))).replace(/</g, "\\u003c");
	const page = () => fs.readFileSync(path.join(UI, "board.html"), "utf8").replace("__ICONS__", () => icons);
	const markdown = new Marked({ gfm: true, renderer: { html: ({ text }) => escapeHtml(text) } });

	// Git pipeline across every worktree: slow on big repos, so it refreshes in the background and after a move,
	// and the version poll reads its fingerprint.
	let pipeline: Pipeline | null = null;
	let pipelineHash = "";
	let refreshing: Promise<void> | null = null;
	const refresh = (): Promise<void> => {
		refreshing ??= readPipeline(root, config)
			.then((p) => {
				pipeline = p;
				const { readAt: _readAt, ...rest } = p;
				pipelineHash = createHash("sha1").update(JSON.stringify(rest)).digest("hex").slice(0, 12);
			})
			.catch((error: Error) => log(`git pipeline: ${error.message}`))
			.finally(() => {
				refreshing = null;
			});
		return refreshing;
	};
	const timer = opts.refreshMs === 0 ? null : setInterval(refresh, opts.refreshMs ?? 15_000);
	timer?.unref();

	/** A markdown file under the lifecycle folder by repo-relative path, or null when the path leaves it. */
	function doc(rel: string | null): { path: string; html: string } | null {
		const prefix = `${config.roadmapDir}/`;
		if (typeof rel !== "string" || !rel.startsWith(prefix) || !rel.endsWith(".md")) return null;
		if (path.posix.normalize(rel) !== rel || rel.includes("\\")) return null;
		const abs = path.join(root, rel);
		if (!abs.startsWith(lifecycle + path.sep)) return null;
		let real: string;
		try {
			real = fs.realpathSync(abs);
		} catch {
			return null;
		}
		if (!real.startsWith(fs.realpathSync(lifecycle) + path.sep)) return null;
		return { path: rel, html: markdown.parse(fs.readFileSync(real, "utf8")) as string };
	}

	function moveInput(body: unknown): MoveInput | null {
		const { slug, from, to } = (body ?? {}) as Record<string, unknown>;
		const stage = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= config.stages.length;
		if (typeof slug !== "string" || !slug || slug.length > 120 || !stage(from) || !stage(to)) return null;
		return { slug, from, to };
	}

	const handle: http.RequestListener = async (req, res) => {
		// DNS rebinding and cross-site writes: only this host, only same-origin JSON posts.
		if (!hosts.has(req.headers.host ?? "")) return send(res, 403, { error: "forbidden" });
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
		try {
			if (req.method === "GET" && url.pathname === "/") return send(res, 200, page(), "text/html; charset=utf-8");
			if (req.method === "GET" && url.pathname === "/api/board") {
				const board = loadBoard(root, config, { pipeline });
				return send(res, 200, { ...board, version: `${board.version}.${pipelineHash}` });
			}
			if (req.method === "GET" && url.pathname === "/api/doc") {
				const d = doc(url.searchParams.get("path"));
				return d ? send(res, 200, d) : send(res, 404, { error: "That file is not in the lifecycle folder." });
			}
			if (req.method === "GET" && url.pathname === "/api/version") {
				return send(res, 200, { version: `${boardVersion(root, config.roadmapDir, config.mainBranch)}.${pipelineHash}` });
			}
			if (req.method === "POST" && (url.pathname === "/api/plan" || url.pathname === "/api/move")) {
				if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: "forbidden" });
				if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
					return send(res, 415, { error: "Send JSON." });
				}
				let body: unknown;
				try {
					body = await readJson(req);
				} catch (error) {
					return (error as Error).message === "too large"
						? send(res, 413, { error: "That request is too large." })
						: send(res, 400, { error: "Send JSON." });
				}
				const input = moveInput(body);
				if (!input) return send(res, 400, { error: "That is not a move." });
				if (url.pathname === "/api/plan") return send(res, 200, planMove(root, config, input));
				try {
					const { plan, commit } = moveFeature(root, config, input);
					log(`${input.slug} ${input.from} -> ${input.to}, ${config.mainBranch} at ${commit.slice(0, 8)}`);
					await refresh();
					return send(res, 200, { plan, commit });
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					log(`${input.slug} ${input.from} -> ${input.to} refused: ${message}`);
					return send(res, 409, { error: clientMessage(message) });
				}
			}
			return send(res, 404, { error: "not found" });
		} catch (error) {
			log(error instanceof Error ? (error.stack ?? error.message) : String(error));
			return send(res, 500, { error: "GitBoard could not read the lifecycle folder." });
		}
	};

	return { handle, refresh, close: () => timer && clearInterval(timer) };
}

/** Starts the server on 127.0.0.1 and ::1. Resolves once the IPv4 listener is up. */
export async function listen(opts: BoardServerOptions): Promise<{ url: string; close: () => void }> {
	const server = createBoardServer(opts);
	await server.refresh();
	const v4 = http.createServer(server.handle);
	await new Promise<void>((resolve, reject) => {
		v4.once("error", (error: NodeJS.ErrnoException) =>
			reject(error.code === "EADDRINUSE" ? new Error(`port ${opts.port} is in use; pass --port`) : error),
		);
		v4.listen(opts.port, "127.0.0.1", resolve);
	});
	// A browser may try localhost over IPv6 first. A machine without IPv6 loopback still serves on 127.0.0.1.
	const v6 = http.createServer(server.handle);
	v6.on("error", () => v6.close());
	v6.listen(opts.port, "::1");
	return {
		url: `http://localhost:${opts.port}`,
		close: () => {
			server.close();
			v4.close();
			v6.close();
		},
	};
}
