// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { findRelations, openDecisions, openOps } from "../src/relations.js";

describe("relations", () => {
	it("reads open decisions in bullet, numbered and table form and skips settled ones", () => {
		const md = [
			"# Build",
			"## Open decisions",
			"DECISION REQUIRED until the owner confirms.",
			"- **D1 (02) Lanes.** Keep slug lanes? Recommend: yes.",
			"- **D4 (03) Commit.** Settled on 22/10/2026.",
			"1. **(03) Production exposure.** DECISION REQUIRED.",
			"   - land 03 and 04 together",
			"| # | Topic | Status |",
			"| --- | --- | --- |",
			"| D9 | Webhook | open |",
			"| D10 | Export | Resolved 15/10 |",
			"## Close-out",
			"- not a decision",
		].join("\n");
		expect(openDecisions(md)).toEqual([
			"D1 (02) Lanes. Keep slug lanes? Recommend: yes.",
			"(03) Production exposure. DECISION REQUIRED.",
			"D9 · Webhook · open",
		]);
	});

	it("reads unticked ops actions only", () => {
		const md = "## Ops actions (owner or infra)\n\n- [ ] Approve the mock.\n- [x] Rotate the key.\n\n## Status\n- [ ] not ops";
		expect(openOps(md)).toEqual(["Approve the mock."]);
	});

	it("splits mentions into dependencies and links, picking the named stage", () => {
		const features = [
			{
				id: "3:cart-flow",
				slug: "cart-flow",
				stageFolder: "3.open",
				text: "Pointer: build in `search-rebuild/02` first.\nSee [daily](./daily-digest.md).\nAlso 5.complete/daily-digest/ for history.",
			},
			{ id: "3:search-rebuild", slug: "search-rebuild", stageFolder: "3.open", text: "Feeds cart-flow later." },
			{ id: "3:daily-digest", slug: "daily-digest", stageFolder: "3.open", text: "" },
			{ id: "5:daily-digest", slug: "daily-digest", stageFolder: "5.complete", text: "" },
		];
		const rel = findRelations(features);
		expect(rel.get("3:cart-flow")).toEqual({ deps: ["3:search-rebuild"], links: ["5:daily-digest"] });
		expect(rel.get("3:search-rebuild")).toEqual({ deps: [], links: ["3:cart-flow"] });
	});

	it("uses the configured stage folders, not a fixed list", () => {
		const features = [
			{ id: "1:alpha-one", slug: "alpha-one", stageFolder: "1.backlog", text: "Needs beta-two." },
			{ id: "1:beta-two", slug: "beta-two", stageFolder: "1.backlog", text: "" },
			{ id: "2:beta-two", slug: "beta-two", stageFolder: "2.doing", text: "" },
			{ id: "2:gamma-3", slug: "gamma-3", stageFolder: "2.doing", text: "See 1.backlog/beta-two/ here" },
		];
		const rel = findRelations(features);
		expect(rel.get("2:gamma-3")).toEqual({ deps: [], links: ["1:beta-two"] });
		expect(rel.get("1:alpha-one")?.deps).toEqual(["2:beta-two"]);
	});

	it("ignores a slug inside a longer word", () => {
		const features = [
			{ id: "1:a", slug: "page-speed", stageFolder: "1.ideas", text: "page-speedy is not it, nor xpage-speed" },
			{ id: "1:b", slug: "other-thing", stageFolder: "1.ideas", text: "mentions page-speedy and `page-speed-two`" },
		];
		expect(findRelations(features).get("1:b")).toEqual({ deps: [], links: [] });
	});
});
