// SPDX-License-Identifier: MIT
// A server request's read path from its trace: every outbound call, which wave it ran in, and whether the shell or the page made it.
import { type CallKind, type CallRule, OTHER_TARGET, type PathFold } from "./config.js";

/** One OTLP span from `gcx traces get -o json`, flattened with its resource's service name. */
export type Span = {
	service: string;
	name: string;
	kind: string;
	id: string;
	parent: string | null;
	startNs: number;
	endNs: number;
	attrs: Record<string, unknown>;
	resource: Record<string, unknown>;
};

/** How the tab draws one target: its column, group, singular label and icon, and the words its card title drops. */
export type TargetInfo = { kind: CallKind; group: string; label: string; icon: string | null; prefix: string };

export type Call = {
	endpoint: string;
	/** The matching rule's target, or `provider` for a call no rule matches. */
	target: string;
	method: string;
	startMs: number;
	durMs: number;
	wave: number;
	origin: "shell" | "page";
};

type OtlpValue = Record<string, unknown> | undefined;
type OtlpAttr = { key: string; value?: OtlpValue };

function attrValue(value: OtlpValue): unknown {
	if (!value) return null;
	const [first] = Object.values(value);
	return first ?? null;
}

function attrMap(list: OtlpAttr[] | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const a of list ?? []) out[a.key] = attrValue(a.value);
	return out;
}

/** Flatten a trace document (`{ trace: { resourceSpans } }`) into spans. */
export function flattenTrace(doc: unknown): Span[] {
	const trace = (doc as { trace?: { resourceSpans?: unknown[] } }).trace ?? (doc as { resourceSpans?: unknown[] });
	const out: Span[] = [];
	for (const rs of (trace.resourceSpans ?? []) as { resource?: { attributes?: OtlpAttr[] }; scopeSpans?: { spans?: Record<string, unknown>[] }[] }[]) {
		const resource = attrMap(rs.resource?.attributes);
		const service = String(resource["service.name"] ?? "");
		for (const ss of rs.scopeSpans ?? []) {
			for (const s of ss.spans ?? []) {
				out.push({
					service,
					name: String(s.name),
					kind: String(s.kind ?? ""),
					id: String(s.spanId),
					parent: (s.parentSpanId as string | undefined) || null,
					startNs: Number(s.startTimeUnixNano),
					endNs: Number(s.endTimeUnixNano),
					attrs: attrMap(s.attributes as OtlpAttr[] | undefined),
					resource,
				});
			}
		}
	}
	return out;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Numeric ids of six digits or more, as a whole path segment. */
const LONG_ID = /\/\d{6,}(?=\/|$)/g;

/** A rule's endpoint template: its own, else `{host} {path}` for a rule on the URL and `{name}` for one on the span name. */
const templateOf = (r: CallRule) => r.endpoint ?? (r.host !== undefined || r.path !== undefined ? "{host} {path}" : "{name}");

const hostMatches = (pattern: string, host: string) => (pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : host === pattern);

/**
 * A stable name for a client span, from the first rule it matches: such as `rpc permit` for a rule with path
 * `/rest/v1/rpc/` and endpoint `rpc {rest}`, or `api.example.com /orders/{id}` for a call no rule matches. Ids are
 * folded (UUIDs everywhere, long numbers and `pathFolds` in `{path}` and `{rest}`) so the same call reads the same on
 * every page.
 */
export function endpointOf(span: Span, rules: CallRule[] = [], folds: PathFold[] = []): { endpoint: string; target: string; method: string } | null {
	if (span.kind !== "SPAN_KIND_CLIENT") return null;
	const raw = String(span.attrs["http.url"] ?? span.attrs["url.full"] ?? span.name.replace(/^fetch \w+ /, ""));
	const method = String(span.attrs["http.method"] ?? span.attrs["http.request.method"] ?? span.name.split(" ")[1] ?? "");
	let url: URL | null = null;
	try {
		url = new URL(raw);
	} catch {
		// A span with no URL can still match a rule on its name.
	}
	const p = url ? url.pathname.replace(UUID, "{id}") : "";
	const fold = (s: string) => folds.reduce((t, f) => t.replace(new RegExp(f.match, "g"), f.replace), s).replace(LONG_ID, "/{id}");
	const rule = rules.find(
		(r) =>
			(r.span === undefined || span.name.startsWith(r.span)) &&
			(r.host === undefined || (url !== null && hostMatches(r.host, url.hostname))) &&
			(r.path === undefined || (url !== null && p.startsWith(r.path))),
	);
	if (!rule && !url) return null;
	// Folds look for ids after a slash: give `{rest}` its slash back while folding, so an id right after `path` folds too.
	const after = rule?.path ? p.slice(rule.path.length) : p;
	const rest = after.startsWith("/") ? fold(after) : fold(`/${after}`).slice(1);
	const values: Record<string, string> = { host: url?.hostname ?? "", path: fold(p), rest, first: rest.replace(/^\//, "").split("/")[0], name: span.name };
	const template = rule ? templateOf(rule) : "{host} {path}";
	const endpoint = template.replace(/\{(host|path|rest|first|name)\}/g, (_, k: string) => values[k]);
	// A rule on the span name alone takes the method from the name, as cache client spans named like `<client> GET key` carry it.
	const onName = rule?.span !== undefined && rule.host === undefined && rule.path === undefined;
	return { endpoint, target: rule?.target ?? OTHER_TARGET, method: onName ? (span.name.split(" ")[1] ?? "") : method };
}

/** How the tab draws each target the rules name, and the target of calls no rule matches. */
export function targetsOf(rules: CallRule[]): Record<string, TargetInfo> {
	const out: Record<string, TargetInfo> = {};
	for (const r of rules) {
		if (Object.hasOwn(out, r.target)) continue;
		const label = r.label ?? r.target;
		// The words before the first placeholder; a template with none is the whole name and drops nothing.
		const template = templateOf(r);
		out[r.target] = { kind: r.kind, group: r.group ?? label, label, icon: r.icon ?? null, prefix: template.includes("{") ? template.split("{")[0] : "" };
	}
	out[OTHER_TARGET] = { kind: "provider", group: "Providers", label: "Provider", icon: null, prefix: "" };
	return out;
}

/**
 * Group calls into waves. A call opens a new wave when it starts after a call of the current wave has
 * finished: it could have waited on that call. Calls already in flight together share a wave.
 */
export function assignWaves<T extends { startMs: number; durMs: number }>(calls: T[]): (T & { wave: number })[] {
	const sorted = [...calls].sort((a, b) => a.startMs - b.startMs);
	const out: (T & { wave: number })[] = [];
	let wave = 0;
	let firstEnd = Number.POSITIVE_INFINITY;
	for (const call of sorted) {
		if (wave === 0 || call.startMs >= firstEnd - 1) {
			wave += 1;
			firstEnd = call.startMs + call.durMs;
		} else {
			firstEnd = Math.min(firstEnd, call.startMs + call.durMs);
		}
		out.push({ ...call, wave });
	}
	return out;
}

/**
 * The shell's endpoints: those called on at least `share` of the requests that make any call. The shell
 * (the app layout: session, profile, navigation) runs on every signed-in page; a page's own reads do not.
 */
export function shellEndpoints(requests: { endpoint: string }[][], share = 0.9): Set<string> {
	const withCalls = requests.filter((calls) => calls.length > 0);
	const seen = new Map<string, number>();
	for (const calls of withCalls) for (const e of new Set(calls.map((c) => c.endpoint))) seen.set(e, (seen.get(e) ?? 0) + 1);
	return new Set([...seen].filter(([, n]) => n >= Math.ceil(withCalls.length * share)).map(([e]) => e));
}

/** The server request's calls in start order, each with its wave and whether the shell or the page made it. */
export function readPath(
	spans: Span[],
	shell: Set<string>,
	service?: string,
	rules: CallRule[] = [],
	folds: PathFold[] = [],
): { server: Span | null; calls: Call[] } {
	// The named service's server span: a trace can hold an upstream service's server span first.
	const server = spans.find((s) => s.kind === "SPAN_KIND_SERVER" && (!service || s.service === service)) ?? null;
	if (!server) return { server, calls: [] };
	// The server's own client spans: the browser's span for the same request (real user monitoring) is not a call the page made.
	const raw = spans
		.filter((s) => s.service === server.service && s.startNs >= server.startNs)
		.map((s) => ({ s, e: endpointOf(s, rules, folds) }))
		.filter((x): x is { s: Span; e: NonNullable<ReturnType<typeof endpointOf>> } => x.e !== null)
		.map(({ s, e }) => ({ ...e, startMs: Math.round((s.startNs - server.startNs) / 1e6), durMs: Math.round((s.endNs - s.startNs) / 1e6) }));
	const firstShell = new Set<string>();
	return {
		server,
		calls: assignWaves(raw).map((c) => {
			const origin = shell.has(c.endpoint) && !firstShell.has(c.endpoint) ? "shell" : "page";
			if (origin === "shell") firstShell.add(c.endpoint);
			return { ...c, origin };
		}),
	};
}
