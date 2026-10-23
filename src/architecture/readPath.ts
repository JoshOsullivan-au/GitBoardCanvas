// SPDX-License-Identifier: MIT
// A server request's read path from its trace: every outbound call, which wave it ran in, and whether the shell or the page made it.

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

/** Where a network call goes. Supabase calls split by API; anything else is a provider. */
export type Target = "auth" | "rpc" | "table" | "storage" | "redis" | "provider";

export type Call = {
	endpoint: string;
	target: Target;
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

/**
 * A stable name for a client span: `rpc permit`, `table brands`, `auth admin/users/{id}`, `redis GET channel`,
 * or `graph.facebook.com /act_{id}/campaigns`. Ids are folded so the same call reads the same on every page.
 */
export function endpointOf(span: Span): { endpoint: string; target: Target; method: string } | null {
	if (span.kind !== "SPAN_KIND_CLIENT") return null;
	if (span.name.startsWith("redis ")) return { endpoint: span.name, target: "redis", method: span.name.split(" ")[1] ?? "" };
	const raw = String(span.attrs["http.url"] ?? span.attrs["url.full"] ?? span.name.replace(/^fetch \w+ /, ""));
	const method = String(span.attrs["http.method"] ?? span.attrs["http.request.method"] ?? span.name.split(" ")[1] ?? "");
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	const p = url.pathname.replace(UUID, "{id}");
	if (url.hostname.endsWith(".supabase.co")) {
		if (p.startsWith("/rest/v1/rpc/")) return { endpoint: `rpc ${p.slice(13)}`, target: "rpc", method };
		if (p.startsWith("/rest/v1/")) return { endpoint: `table ${p.slice(9)}`, target: "table", method };
		if (p.startsWith("/auth/v1/")) return { endpoint: `auth ${p.slice(9)}`, target: "auth", method };
		if (p.startsWith("/storage/v1/")) return { endpoint: `storage ${p.slice(12).split("/")[0]}`, target: "storage", method };
	}
	const tail = p
		.replace(/\/v\d+(\.\d+)?\//, "/")
		.replace(/\/act_\d+/, "/act_{id}")
		.replace(/\/\d{6,}(?=\/|$)/g, "/{id}");
	return { endpoint: `${url.hostname} ${tail}`, target: "provider", method };
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
export function readPath(spans: Span[], shell: Set<string>): { server: Span | null; calls: Call[] } {
	const server = spans.find((s) => s.kind === "SPAN_KIND_SERVER") ?? null;
	if (!server) return { server, calls: [] };
	// The server's own client spans: the browser's span for the same request (real user monitoring) is not a call the page made.
	const raw = spans
		.filter((s) => s.service === server.service && s.startNs >= server.startNs)
		.map((s) => ({ s, e: endpointOf(s) }))
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
