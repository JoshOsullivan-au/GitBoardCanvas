// SPDX-License-Identifier: MIT
// Per-viewer settings in localStorage. A private window or blocked storage reads as nothing and drops writes.

export function load<T>(key: string): Partial<T> {
	try {
		return JSON.parse(localStorage.getItem(key) || "{}") as Partial<T>;
	} catch {
		return {};
	}
}

export function loadText(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function save(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
	} catch {}
}
