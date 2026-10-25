// SPDX-License-Identifier: MIT
// A feature's details panel, and its phase files rendered in place: roadmap links open in place, Back returns.
import { type CSSProperties, Fragment, useRef } from "react";

import { CopyPath } from "../components/shell/CopyPath";
import { ddmm, plural } from "../lib/format";
import { GIT_STEPS, prStates } from "../lib/git";
import { Icon } from "../lib/icon";
import { Markdown } from "../lib/markdown";
import { cardState, type Feature, groupIcon, isDone, type Model, stageName, stageTone } from "./model";

export type Crumb = { path: string; label: string; phaseIndex: number | null };
export type DetailsView = { id: string } & ({ kind: "card" } | ({ kind: "doc"; trail: Crumb[]; html: string } & Crumb));

const VIA = { roadmap: "roadmap files", branch: "branch name", code: "code it names" };

/** The feature's folder, repo-relative; a feature that is only a build list is its `<slug>.md`. */
const featurePath = (m: Model, c: Feature) => {
	const dir = `${m.roadmapDir}/${m.stages.find((s) => s.id === c.stage)?.folder ?? ""}/${c.slug}`;
	return c.hasFolder ? dir : `${dir}.md`;
};

type Open = { details: (id: string) => void; doc: (id: string, path: string, label: string, phaseIndex: number | null, trail?: Crumb[]) => void };

function FeatureRows({ m, byId, ids, open }: { m: Model; byId: Map<string, Feature>; ids: string[]; open: Open }) {
	const list = ids
		.map((id) => byId.get(id))
		.filter((n): n is Feature => Boolean(n))
		.sort((a, b) => a.stage - b.stage || a.title.localeCompare(b.title));
	return (
		<ul className="rel">
			{list.map((n) => {
				const st = cardState(m, n);
				return (
					<li key={n.id}>
						<button type="button" className={`relr ${st.cls}`} data-goto={n.id} onClick={() => open.details(n.id)}>
							<span className="tile">
								<Icon name={groupIcon(m, n.group)} />
							</span>
							<span className="tx">
								<b>{n.title}</b>
								<span>
									{n.stage} {stageName(m, n.stage)} · {st.word}
								</span>
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

function Git({ m, c }: { m: Model; c: Feature }) {
	const rows = c.git.map((g) => {
		const counts = { wip: g.wip, staged: g.staged, committed: g.committed, pr: g.pr ? 1 : 0 };
		const files = (
			[
				["WIP", g.files.wip, g.wip],
				["Staged", g.files.staged, g.staged],
				["Committed", g.files.committed, g.committed],
			] as const
		).filter(([, , n]) => n);
		const states = g.pr ? prStates(g.pr) : [];
		return (
			<li className="gitb" key={g.branch}>
				<div className="gbh">
					<Icon name="GitBranch" />
					<b>{g.branch}</b>
					<span className="via">via {VIA[g.via]}</span>
					{g.pr ? (
						<a href={g.pr.url} target="_blank" rel="noopener noreferrer">
							PR #{g.pr.number}
							{g.pr.draft ? " (draft)" : ""}
						</a>
					) : null}
				</div>
				{states.length ? (
					<ul className="prst" aria-label="Pull request status">
						{states.map((s) => (
							<li key={s.k} className={s.attn ? "gs-attn" : "gs-pr"}>
								{s.attn ? <Icon name="Warning" /> : null}
								{s.text}
							</li>
						))}
					</ul>
				) : null}
				<ol className="track">
					{GIT_STEPS.map((x) => (
						<li key={x.k} className={counts[x.k] ? `on gs-${x.k}` : ""}>
							<span className="dot">
								<Icon name={x.icon} />
							</span>
							<span className="tn">{x.name}</span>
							<b>{x.k === "pr" ? (g.pr ? `#${g.pr.number}` : "") : counts[x.k] || ""}</b>
						</li>
					))}
					<li className="">
						<span className="dot">
							<Icon name="GitMerge" />
						</span>
						<span className="tn">Landed</span>
						<b></b>
					</li>
				</ol>
				{g.commits ? <div className="gnote">{plural(g.commits, "commit")} not on main</div> : null}
				{files.length ? (
					<details className="gfiles">
						<summary>
							<Icon name="CaretRight" />
							Files
						</summary>
						{files.map(([k, list, n]) => (
							<Fragment key={k}>
								<div className="gfk">{k}</div>
								<ul>
									{list.map((f) => (
										<li key={f}>{f}</li>
									))}
									{n > list.length ? <li className="more">{n - list.length} more</li> : null}
								</ul>
							</Fragment>
						))}
					</details>
				) : null}
			</li>
		);
	});
	const landed = c.landed ? (
		<div className="landed">
			<Icon name="GitMerge" />
			<span>
				Landed on main {ddmm(c.landed.at)} · {c.landed.sha}
			</span>
		</div>
	) : null;
	const gh = m.github === false ? <div className="gnote">Pull requests: Missing GitHub</div> : null;
	if (!rows.length && !landed && !gh) return null;
	return (
		<section className="ps">
			<h5>
				<Icon name="GitBranch" />
				Git
			</h5>
			{rows.length ? <ul className="gitl">{rows}</ul> : null}
			{landed}
			{gh}
		</section>
	);
}

function Relations({ m, byId, c, open }: { m: Model; byId: Map<string, Feature>; c: Feature; open: Open }) {
	const unblocks = c.dependents.filter((id) => !isDone(m, byId.get(id)!));
	const linked = c.linkIds.filter((id) => !c.blockedBy.includes(id) && !unblocks.includes(id));
	const items = [...c.decisions.map((d) => ["Decision", d]), ...c.ops.map((o) => ["Ops", o])];
	return (
		<>
			{c.blockedBy.length ? (
				<section className="ps">
					<h5>
						<Icon name="Lock" />
						Blocked by
					</h5>
					<FeatureRows m={m} byId={byId} ids={c.blockedBy} open={open} />
				</section>
			) : null}
			{c.gated ? (
				<section className="ps">
					<h5>
						<Icon name="HourglassMedium" />
						Waiting on you
					</h5>
					<ul className="gate">
						{items.slice(0, 12).map(([k, t], i) => (
							<li key={i}>
								<span className="chip2">{k}</span>
								<span>{t}</span>
							</li>
						))}
					</ul>
					{items.length > 12 ? <div className="more">{items.length - 12} more</div> : null}
				</section>
			) : null}
			{unblocks.length ? (
				<section className="ps">
					<h5>
						<Icon name="ArrowRight" />
						Unblocks
					</h5>
					<FeatureRows m={m} byId={byId} ids={unblocks} open={open} />
				</section>
			) : null}
			{linked.length ? (
				<section className="ps">
					<h5>
						<Icon name="Link" />
						Linked
					</h5>
					<FeatureRows m={m} byId={byId} ids={linked} open={open} />
				</section>
			) : null}
		</>
	);
}

function Doc({ m, c, view, open, close }: { m: Model; c: Feature; view: Extract<DetailsView, { kind: "doc" }>; open: Open; close: () => void }) {
	const back = useRef<HTMLButtonElement>(null);
	const onLink = (next: string) => {
		if (!next.startsWith(`${m.roadmapDir}/`) || !next.endsWith(".md")) return;
		open.doc(c.id, next, next.split("/").slice(-2).join("/"), null, [...view.trail, { path: view.path, label: view.label, phaseIndex: view.phaseIndex }]);
	};
	const prev = view.trail[view.trail.length - 1];
	return (
		<div className="dlg">
			<button type="button" className="x" aria-label="Close" onClick={close}>
				<Icon name="X" />
			</button>
			<CopyPath path={view.path} />
			<div className="doc-head">
				<button
					type="button"
					className="icon-btn"
					data-back
					aria-label="Back"
					ref={back}
					onClick={() => (prev ? open.doc(c.id, prev.path, prev.label, prev.phaseIndex, view.trail.slice(0, -1)) : open.details(c.id))}
				>
					<Icon name="CaretLeft" />
				</button>
				<span className="crumb">
					{c.title} · {view.label}
				</span>
			</div>
			<Markdown html={view.html} path={view.path} onLink={onLink} onShown={() => back.current?.focus()} />
		</div>
	);
}

export function Details({ m, byId, view, open, close }: { m: Model; byId: Map<string, Feature>; view: DetailsView; open: Open; close: () => void }) {
	const c = byId.get(view.id);
	if (!c) return null;
	if (view.kind === "doc") return <Doc m={m} c={c} view={view} open={open} close={close} />;
	const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
	const shown = c.open.slice(0, 12);
	const more = c.total - c.done - shown.length;
	return (
		<div className="dlg">
			<button type="button" className="x" aria-label="Close" onClick={close}>
				<Icon name="X" />
			</button>
			<CopyPath path={featurePath(m, c)} />
			<div className="d-head">
				<h2 id="d-title">{c.title}</h2>
				<span className="pill" title={stageName(m, c.stage)} style={{ "--gs": stageTone(m, c.stage) } as CSSProperties}>
					{stageName(m, c.stage)}
				</span>
				<span className="pill" title={c.group}>
					{c.group}
				</span>
			</div>
			{c.total ? (
				<div className="figure-row">
					<span className="figure">
						{c.done}/{c.total}
					</span>
					<span className="meter">
						<i style={{ width: `${pct}%` }}></i>
					</span>
				</div>
			) : null}
			<Relations m={m} byId={byId} c={c} open={open} />
			<Git m={m} c={c} />
			{c.phaseList.length ? (
				<ul className="phase-list">
					{c.phaseList.map((p, i) => (
						<li key={p.path}>
							<button type="button" className="phase" data-phase={i} onClick={() => open.doc(c.id, p.path, `${p.num} ${p.title}`, i)}>
								<span className="num">{p.num}</span>
								<span className="pt">{p.title}</span>
								{p.total ? (
									<span className="pf">
										{p.done}/{p.total}
									</span>
								) : null}
								{p.total && p.done === p.total ? <Icon name="CheckCircle" /> : null}
							</button>
						</li>
					))}
				</ul>
			) : (
				<>
					{shown.length ? (
						<ul className="open">
							{shown.map((t, i) => (
								<li key={i}>
									<Icon name="Circle" />
									<span>{t}</span>
								</li>
							))}
						</ul>
					) : null}
					{more > 0 ? <div className="more">{more} more open</div> : null}
				</>
			)}
		</div>
	);
}
