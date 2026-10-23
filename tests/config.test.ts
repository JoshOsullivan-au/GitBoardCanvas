// SPDX-License-Identifier: MIT
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";
import { init } from "../src/init.js";

let root: string;
const put = (value: unknown) => fs.writeFileSync(path.join(root, "gitboard.config.json"), typeof value === "string" ? value : JSON.stringify(value));

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "gitboard-config-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("loadConfig", () => {
	it("loads the config gitboard init writes", () => {
		init(root, DEFAULT_CONFIG);
		expect(loadConfig(root).architecture).toBeNull();
	});

	it("reads \"architecture\": null as no tab", () => {
		put({ architecture: null });
		expect(loadConfig(root).architecture).toBeNull();
	});

	it("uses the defaults without a file", () => {
		expect(loadConfig(root).roadmapDir).toBe("roadmap");
	});

	it("normalises roadmapDir", () => {
		for (const dir of ["./docs/plans/", "docs/plans/", "./docs/plans", "docs/plans//"]) {
			put({ roadmapDir: dir });
			expect(loadConfig(root).roadmapDir).toBe("docs/plans");
		}
	});

	it.each([
		[{ rewriteSkip: "dist/" }, /rewriteSkip must be an array of strings/],
		[{ rewriteSkip: ["a", 2] }, /rewriteSkip must be an array of strings/],
		[{ codeRoots: ["a", 1] }, /codeRoots must be "auto" or an array of strings/],
		[{ codeRoots: "all" }, /codeRoots must be "auto"/],
		[{ github: "yes" }, /github must be true or false/],
		[{ port: "4610" }, /port must be a number/],
		[{ roadmapDir: 3 }, /roadmapDir must be a string/],
		[{ mainBranch: null }, /mainBranch must be a string/],
		[{ defaultGroup: 1 }, /defaultGroup must be a string/],
		[{ stages: [{ folder: "1.a" }, { folder: "2.b", name: "B" }] }, /stages\[0\]/],
		[{ stages: "x" }, /stages must be an array/],
		[{ groups: [{ name: "A" }] }, /groups\[0\]/],
		[{ lint: { builtin: "yes" } }, /lint\.builtin must be true or false/],
		[{ lint: { command: 5 } }, /lint\.command must be a string or null/],
		[{ lint: { phaseHeadings: "x" } }, /lint\.phaseHeadings must be an array of strings/],
		[{ lint: { readmeSections: [1] } }, /lint\.readmeSections must be an array of strings/],
		[{ lint: [] }, /lint must be an object/],
		[{ hooks: { onEnter: { "4": "echo hi" } } }, /hooks\.onEnter\["4"\] must be an array of strings/],
		[{ hooks: { onEnter: [] } }, /hooks\.onEnter must be an object/],
		[{ hooks: [] }, /hooks must be an object/],
		[[], /must hold a JSON object/],
	])("rejects %j", (value, message) => {
		put(value);
		expect(() => loadConfig(root)).toThrow(message);
	});

	it("reports every wrong key at once", () => {
		put({ github: 1, port: "x" });
		expect(() => loadConfig(root)).toThrow(/github must be true or false; port must be a number/);
	});

	it("rejects a group icon that is not a string", () => {
		put({ groups: [{ name: "P", match: "^p", icon: 3 }] });
		expect(() => loadConfig(root)).toThrow(/groups\[0\]/);
	});

	it("leaves the Architecture tab off without an architecture block", () => {
		expect(loadConfig(root).architecture).toBeNull();
	});

	it("fills an architecture block from the defaults", () => {
		put({ architecture: { budgetMs: 300, tempo: { datasource: "d", service: "svc" } } });
		const a = loadConfig(root).architecture;
		expect(a?.budgetMs).toBe(300);
		expect(a?.data).toBe(".gitboard/architecture.json");
		expect(a?.tempo).toEqual({ datasource: "d", service: "svc", region: null });
	});

	it.each([
		[{ architecture: [] }, /architecture must be an object/],
		[{ architecture: { budgetMs: 0 } }, /architecture\.budgetMs must be a positive whole number/],
		[{ architecture: { data: "../out.json" } }, /architecture\.data must be a repo-relative file/],
		[{ architecture: { areas: [{ name: "A", match: "(" }] } }, /architecture area "A" has an invalid match pattern/],
	])("rejects architecture %j", (value, message) => {
		put(value);
		expect(() => loadConfig(root)).toThrow(message);
	});

	it("reports architecture problems with the other keys", () => {
		put({ github: 1, architecture: { budgetMs: -1 } });
		expect(() => loadConfig(root)).toThrow(/github must be true or false; architecture\.budgetMs/);
	});

	it("accepts a full valid file", () => {
		put({
			roadmapDir: "roadmap",
			mainBranch: "trunk",
			port: 4700,
			codeRoots: ["src/"],
			rewriteSkip: ["dist/"],
			groups: [{ name: "P", match: "^p", icon: "Cube" }],
			lint: { builtin: false, command: null, phaseHeadings: ["Why"], readmeSections: [] },
			hooks: { onEnter: { "5": ["echo {slug}"] } },
			github: false,
		});
		expect(loadConfig(root).mainBranch).toBe("trunk");
	});
});
