// SPDX-License-Identifier: MIT
// The move confirm: the drop is the human gate, the plan names every git step the move takes, in order, with the real
// names and files.
import { type ReactNode, useEffect, useRef } from "react";

import type { MovePlan } from "../../types.js";
import { plural } from "../lib/format";
import { Icon } from "../lib/icon";
import type { Model } from "./model";

export type MoveState = { slug: string; title: string; from: number; to: number; plan: MovePlan; running: boolean; error: string | null };

type Step = { icon: string; title: string; detail: ReactNode; list?: string[] };

function planSteps(m: Model, plan: MovePlan): Step[] {
	const root = `${m.roadmapDir}/`;
	const rel = (p: string) => (p.startsWith(root) ? p.slice(root.length) : p);
	const moved = plan.moves.map((x) => rel(x.from) + (x.from.endsWith(".md") ? "" : "/"));
	const toFolder = rel(plan.moves[0]?.to ?? "").split("/")[0];
	const main = m.mainBranch;
	const steps: Step[] = [
		{
			icon: "GitBranch",
			title: "Create a worktree",
			detail: (
				<>
					Branch <code>{plan.branch}…</code> from {main} at <code>{plan.base}</code>, in a temporary worktree
				</>
			),
		},
		{
			icon: "ArrowsLeftRight",
			title: `Move ${plural(plan.files, "file")}`,
			detail: (
				<>
					{moved.map((x, i) => (
						<span key={x}>
							{i ? " and " : ""}
							<code>{x}</code>
						</span>
					))}{" "}
					to <code>{toFolder}/</code> with <code>git mv</code>
				</>
			),
		},
	];
	if (plan.rewrites.length) steps.push({ icon: "Link", title: `Rewrite links in ${plural(plan.rewrites.length, "file")}`, detail: "Every link and mention of the old place", list: plan.rewrites });
	if (plan.hooks.length) {
		steps.push({
			icon: "ShieldCheck",
			title: "Run hooks and the lint gate",
			detail: (
				<>
					{plan.hooks.map((h, i) => (
						<span key={i}>
							{i ? ", then " : ""}
							<code>{h}</code>
						</span>
					))}
					. If one fails, the move stops and {main} is untouched
				</>
			),
		});
	}
	steps.push(
		{ icon: "GitCommit", title: "Commit", detail: <code>{plan.subject}</code> },
		{ icon: "GitMerge", title: `Merge into ${main}`, detail: `Fast-forward only. If ${main} moved meanwhile, the one commit is replayed on top first` },
		{ icon: "Trash", title: "Clean up", detail: "Remove the worktree and delete the merged branch" },
	);
	return steps;
}

export function MoveConfirm({ m, mv, onMove, onCancel }: { m: Model; mv: MoveState; onMove: () => void; onCancel: () => void }) {
	const from = m.stages.find((s) => s.id === mv.from)!;
	const to = m.stages.find((s) => s.id === mv.to)!;
	const failed = mv.error !== null;
	const cancel = useRef<HTMLButtonElement>(null);
	// A failed move keeps the plan on screen with what went wrong; Close takes focus.
	useEffect(() => {
		if (failed) cancel.current?.focus();
	}, [failed]);
	return (
		<div className="dlg mv">
			<h2 id="c-title">Move {mv.title}</h2>
			<div className="route">
				<span className="pill">
					{from.id} {from.name}
				</span>
				<Icon name="ArrowRight" />
				<span className="pill to">
					{to.id} {to.name}
				</span>
			</div>
			{mv.plan.warnings.length ? (
				<ul className="warns">
					{mv.plan.warnings.map((w, i) => (
						<li key={i}>
							<Icon name="Warning" />
							<span>{w}</span>
						</li>
					))}
				</ul>
			) : null}
			<ol className={`steps${mv.running ? " running" : ""}`}>
				{planSteps(m, mv.plan).map((st) => (
					<li key={st.title}>
						<span className="si">
							<Icon name={st.icon} />
						</span>
						<div className="sx">
							<b>{st.title}</b>
							<span>{st.detail}</span>
							{st.list ? (
								<details>
									<summary>
										<Icon name="CaretRight" />
										Show files
									</summary>
									<ul>
										{st.list.map((f) => (
											<li key={f}>{f}</li>
										))}
									</ul>
								</details>
							) : null}
						</div>
					</li>
				))}
			</ol>
			<p className="err" role="alert" hidden={!failed}>
				{mv.error}
			</p>
			<div className="foot">
				<span className="note">Nothing is pushed</span>
				<button type="button" className="btn" data-act="cancel" disabled={mv.running} onClick={onCancel} ref={cancel}>
					{failed ? "Close" : "Cancel"}
				</button>
				{failed ? null : (
					<button type="button" className="btn primary" data-act="move" data-autofocus aria-busy={mv.running ? "true" : undefined} onClick={onMove}>
						Move and merge
					</button>
				)}
			</div>
		</div>
	);
}
