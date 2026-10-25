// SPDX-License-Identifier: MIT
// Phosphor icons from the set the server injects: light weight in light mode, regular in dark (board.css).
import { icons } from "./boot";

export const hasIcon = (name: string | null | undefined): name is string => Boolean(name && Object.hasOwn(icons(), name));

export function Icon({ name, className }: { name: string; className?: string }) {
	const p = icons()[name];
	if (!p) return null;
	return (
		<svg className={className ? `ph ${className}` : "ph"} viewBox="0 0 256 256" aria-hidden="true">
			<path className="w-light" d={p.light[0]} />
			<path className="w-regular" d={p.regular[0]} />
		</svg>
	);
}

/** The same icon as markup, for DOM the board fills itself (rendered markdown). */
export function iconSvg(name: string): string {
	const p = icons()[name];
	if (!p) return "";
	return `<svg class="ph" viewBox="0 0 256 256" aria-hidden="true"><path class="w-light" d="${p.light[0]}"/><path class="w-regular" d="${p.regular[0]}"/></svg>`;
}
