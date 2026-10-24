// SPDX-License-Identifier: MIT

/** GET `pathname`, or POST `body` as JSON. Throws the server's own message on a refusal. */
export async function api<T>(pathname: string, body?: unknown): Promise<T> {
	const res = await fetch(
		pathname,
		body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" },
	);
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error((json as { error?: string }).error || "The board server did not answer.");
	return json as T;
}
