// SPDX-License-Identifier: MIT

const two = (n: number) => String(n).padStart(2, "0");

export const ddmmyyyy = (ms: number) => {
	const d = new Date(ms);
	return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const ddmm = (ms: number | null | undefined) => {
	if (!ms) return "";
	const d = new Date(ms);
	return `${two(d.getDate())}/${two(d.getMonth() + 1)}`;
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const firstLine = (m: unknown) => String(m).split("\n")[0];

export const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
