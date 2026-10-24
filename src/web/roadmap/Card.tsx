// SPDX-License-Identifier: MIT
import { ddmmyyyy, plural } from "../lib/format";
import { GIT_STEPS, gitSummary } from "../lib/git";
import { Icon } from "../lib/icon";
import { cardState, type Feature, groupIcon, type Model, stageName } from "./model";

function GitBadge({ c }: { c: Feature }) {
	const t = gitSummary(c);
	if (!t.top || t.top === "landed") return null;
	const step = GIT_STEPS.find((x) => x.k === t.top)!;
	if (t.top === "pr") {
		const w = t.worst;
		const text = `${t.prs.length === 1 ? `PR #${t.prs[0].number}` : `${t.prs.length} PRs`}${w ? ` · ${w.chip}` : ""}`;
		const title = [c.git.map((g) => g.branch).join(", "), w?.text].filter(Boolean).join(": ");
		return (
			<span className={`av-b ${w?.attn ? "gs-attn" : "gs-pr"}`} title={title}>
				<Icon name={w?.attn ? "Warning" : step.icon} />
				{text}
			</span>
		);
	}
	const text = `${t[t.top]} ${step.name === "WIP" ? "WIP" : step.name.toLowerCase()}`;
	return (
		<span className={`av-b gs-${t.top}`} title={c.git.map((g) => g.branch).join(", ")}>
			<Icon name={step.icon} />
			{text}
		</span>
	);
}

export function Card({ m, c, trace, grabbed, dragging }: { m: Model; c: Feature; trace: Feature | null; grabbed: boolean; dragging: boolean }) {
	const st = cardState(m, c);
	const on = Boolean(trace && (trace.id === c.id || trace.linkIds.includes(c.id)));
	const dim = Boolean(trace) && !on;
	const g = gitSummary(c);
	const gitWord =
		g.top && g.top !== "landed"
			? `git: ${GIT_STEPS.filter((x) => (x.k === "pr" ? g.pr : g[x.k]))
					.map((x) => (x.k === "pr" ? `${g.pr} PR${g.worst ? ` (${g.worst.text})` : ""}` : `${g[x.k]} ${x.name}`))
					.join(", ")}`
			: "";
	const extra = [c.phases ? plural(c.phases, "phase") : "", c.linkIds.length ? `${c.linkIds.length} linked` : ""];
	const sub = [...new Set([st.word, ...extra].filter(Boolean))].join(" · ");
	const label = [c.title, stageName(m, c.stage), c.group, sub, gitWord].filter(Boolean).join(", ");
	return (
		<div
			className={`card lg lg-regular ${st.cls}${on ? " on" : ""}${dim ? " off" : ""}`}
			data-card={c.id}
			role="button"
			tabIndex={0}
			aria-roledescription="Draggable card"
			aria-label={`${label}.`}
			data-grabbed={grabbed ? "" : undefined}
			data-dragging={dragging ? "" : undefined}
		>
			<span className="chips fit">
				{c.createdAt ? (
					<span className="av-b dt" title={`Created ${ddmmyyyy(c.createdAt)}`}>
						<Icon name="CalendarBlank" />
						{ddmmyyyy(c.createdAt)}
					</span>
				) : null}
				<GitBadge c={c} />
			</span>
			<span className="tile">
				<Icon name={groupIcon(m, c.group)} />
			</span>
			<span className="tx">
				<b>{c.title}</b>
				<span>{sub}</span>
			</span>
			<span className="st">{st.mark ? <Icon name={st.mark} /> : null}</span>
		</div>
	);
}
