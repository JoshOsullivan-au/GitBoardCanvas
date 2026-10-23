// SPDX-License-Identifier: MIT
// Reading the repo never changes it: every command and route except a move, `init` and `measure` leaves the working
// tree, the git index and the refs of every checkout as they were. `init` and `measure` add only their own files.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_ARCHITECTURE } from "../src/architecture/config.js";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { init } from "../src/init.js";
import { createBoardServer } from "../src/server.js";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let root: string;
let side: string;

const put = (rel: string, body: string, base = root) => {
	fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
	fs.writeFileSync(path.join(base, rel), body);
};

/** Every entry under `dir` (skipping `.git`): kind, mode, size, content hash and mtime; symlinks by target. */
function tree(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (abs: string) => {
		for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
			if (e.name === ".git") continue;
			const p = path.join(abs, e.name);
			const rel = path.relative(dir, p);
			const st = fs.lstatSync(p);
			if (e.isSymbolicLink()) out[rel] = `link ${fs.readlinkSync(p)}`;
			else if (e.isDirectory()) {
				out[rel] = `dir ${st.mode} ${st.mtimeMs}`;
				walk(p);
			} else out[rel] = `file ${st.mode} ${st.size} ${st.mtimeMs} ${createHash("sha256").update(fs.readFileSync(p)).digest("hex")}`;
		}
	};
	walk(dir);
	return out;
}

const hash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** The repo as a person would notice it changed: both checkouts' files, both indexes, refs, stash and worktrees. */
function snapshot() {
	const sideGit = git(side, "rev-parse", "--git-dir").trim();
	return {
		main: tree(root),
		side: tree(side),
		mainIndex: hash(path.join(root, ".git", "index")),
		sideIndex: hash(path.resolve(side, sideGit, "index")),
		refs: git(root, "for-each-ref", "--format=%(refname) %(objectname)"),
		head: git(root, "rev-parse", "HEAD"),
		stash: git(root, "stash", "list"),
		worktrees: git(root, "worktree", "list", "--porcelain"),
		gitFiles: fs.readdirSync(path.join(root, ".git")).sort(),
	};
}

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-readonly-")));
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "t@example.com");
	git(root, "config", "user.name", "Test");
	git(root, "config", "commit.gpgsign", "false");
	for (const s of DEFAULT_CONFIG.stages) put(`roadmap/${s.folder}/README.md`, `# ${s.name}\n`);
	put("roadmap/2.planning/checkout.md", "# Checkout\n\n- [ ] one\n- [x] two\n\nDepends on [search](../3.open/search.md).\n");
	put("roadmap/2.planning/checkout/phases/01-data.md", "# Data\r\n\r\n- [ ] model\r\n");
	put("roadmap/3.open/search.md", "# Search\n\n- [ ] index");
	put("app/page.tsx", "export default function Page() {}\n");
	put("app/(shop)/cart/page.tsx", "");
	put("src/checkout.ts", "export const x = 1;\n");
	put(".gitignore", "node_modules\n");
	put("gitboard.config.json", JSON.stringify({ github: false, architecture: { tempo: { datasource: "d", service: "web" }, data: "maps/arch.json" } }));
	put("maps/arch.json", JSON.stringify({ areas: [], routes: [] }));
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "init");
	// A second checkout with a branch ahead and work in flight, as another session would leave it.
	side = path.join(root, ".worktrees", "side");
	git(root, "worktree", "add", "-q", "-b", "feature/checkout", side);
	put("src/checkout.ts", "export const x = 2;\n", side);
	git(side, "commit", "-q", "-am", "checkout work");
	put("src/new.ts", "// untracked\n", side);
	put("roadmap/2.planning/checkout.md", "# Checkout\n\n- [x] one\n- [x] two\n", side);
	// Uncommitted, staged and untracked work in the main checkout.
	put("roadmap/3.open/search.md", "# Search\n\n- [x] index\n");
	put("notes.txt", "staged\n");
	git(root, "add", "notes.txt");
	put("scratch.md", "untracked\n");
	// Files whose stat no longer matches the index: a plain `git status` would refresh and rewrite the index.
	const past = new Date(Date.now() - 3_600_000);
	for (const base of [root, side]) fs.utimesSync(path.join(base, "app/page.tsx"), past, past);
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function request(port: number, pathname: string, body?: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const headers: Record<string, string> = { host: `127.0.0.1:${port}` };
		if (body) Object.assign(headers, { origin: `http://127.0.0.1:${port}`, "content-type": "application/json" });
		const req = http.request({ host: "127.0.0.1", port, path: pathname, method: body ? "POST" : "GET", headers }, (res) => {
			res.resume();
			res.on("end", () => resolve(res.statusCode ?? 0));
		});
		req.on("error", reject);
		req.end(body);
	});
}

describe("reading the repo changes nothing", () => {
	it("leaves files, indexes, refs and worktrees as they were after every read command", () => {
		expect(fs.existsSync(CLI), "run npm run build first").toBe(true);
		const before = snapshot();
		for (const args of [["list"], ["list", "--json"], ["lint"], ["move", "checkout", "open", "--dry-run"], ["--help"], ["--version"], ["nope"]]) {
			spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8" });
			spawnSync(process.execPath, [CLI, ...args], { cwd: side, encoding: "utf8" });
		}
		expect(snapshot()).toEqual(before);
	});

	it("leaves them as they were while the board serves every route and refreshes the git pipeline", async () => {
		const before = snapshot();
		// Port 0: the OS picks a free port, and the board is built for the port it got.
		let handle: http.RequestListener = () => {};
		const server = http.createServer((req, res) => handle(req, res));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as { port: number };
		const board = createBoardServer({ root, config: loadConfig(root), port, refreshMs: 0, log: () => {} });
		handle = board.handle;
		try {
			await board.refresh();
			const statuses = [
				await request(port, "/"),
				await request(port, "/api/board"),
				await request(port, "/api/version"),
				await request(port, `/api/doc?path=${encodeURIComponent("roadmap/2.planning/checkout.md")}`),
				await request(port, "/api/architecture"),
				await request(port, "/api/plan", JSON.stringify({ slug: "checkout", from: 2, to: 3 })),
			];
			expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);
			await board.refresh();
		} finally {
			board.close();
			server.close();
		}
		expect(snapshot()).toEqual(before);
	});
});

describe("writers add only their own files", () => {
	it("init keeps every existing file byte for byte and only appends its .gitignore line", () => {
		put("roadmap/templates/feature/FEATURE.md", "# Mine\n");
		const before = snapshot();
		const { created } = init(root, loadConfig(root));
		const after = snapshot();
		for (const [rel, entry] of Object.entries(before.main)) {
			if (rel === ".gitignore" || entry.startsWith("dir ")) continue;
			expect(after.main[rel], rel).toBe(entry);
		}
		expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toBe("node_modules\n.worktrees/\n");
		expect(Object.keys(after.main).filter((rel) => !before.main[rel] && !after.main[rel].startsWith("dir ")).sort()).toEqual(
			created.filter((f) => f !== ".gitignore").sort(),
		);
		expect({ ...after, main: null }).toEqual({ ...before, main: null });
	});

	it("init writes nothing through a symlink it finds where a template would go", () => {
		const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-outside-")));
		try {
			fs.symlinkSync(path.join(outside, "README.md"), path.join(root, "roadmap", "README.md"));
			init(root, loadConfig(root));
			expect(fs.readdirSync(outside)).toEqual([]);
			expect(fs.lstatSync(path.join(root, "roadmap", "README.md")).isSymbolicLink()).toBe(true);
		} finally {
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	it("measure refuses to overwrite a file that is not a measure", () => {
		fs.writeFileSync(path.join(root, "gitboard.config.json"), JSON.stringify({ architecture: { ...DEFAULT_ARCHITECTURE, tempo: { datasource: "d", service: "web" }, data: "src/checkout.ts" } }));
		const before = fs.readFileSync(path.join(root, "src/checkout.ts"), "utf8");
		// A gcx that fails, first on PATH, so a measure that got past the check would stop without reaching Grafana.
		put(".bin/gcx", "#!/bin/sh\nexit 1\n");
		fs.chmodSync(path.join(root, ".bin/gcx"), 0o755);
		const PATH = `${path.join(root, ".bin")}${path.delimiter}${process.env.PATH}`;
		const out = spawnSync(process.execPath, [CLI, "measure", "--from", "2026-10-23T00:00:00Z", "--to", "2026-10-23T01:00:00Z"], { cwd: root, encoding: "utf8", env: { ...process.env, PATH } });
		expect(out.status).toBe(1);
		expect(out.stderr).toContain("src/checkout.ts is not a measure file; point architecture.data at a new file");
		expect(fs.readFileSync(path.join(root, "src/checkout.ts"), "utf8")).toBe(before);
	});
});

describe("init next to links it does not own", () => {
	it("leaves a symlinked .gitignore and its target alone", () => {
		const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-outside-")));
		try {
			fs.writeFileSync(path.join(outside, "shared-ignore"), "dist\n");
			fs.rmSync(path.join(root, ".gitignore"));
			fs.symlinkSync(path.join(outside, "shared-ignore"), path.join(root, ".gitignore"));
			const { skipped } = init(root, loadConfig(root));
			expect(fs.readFileSync(path.join(outside, "shared-ignore"), "utf8")).toBe("dist\n");
			expect(skipped).toContain(".gitignore");
		} finally {
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});
});
