// SPDX-License-Identifier: MIT
// The forms Copy path offers for one repo-relative path.

export type PathForm = "absolute" | "relative" | "filename";

/**
 * `rel` is repo-relative with "/" separators; `root` is the repo's absolute path in the server's own separators, so
 * the absolute form uses "\" on Windows. An empty `root` leaves the absolute form empty.
 */
export function pathForms(root: string, rel: string): Record<PathForm, string> {
	const relative = rel.replace(/^\.?\/+|\/+$/g, "");
	const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
	return {
		absolute: root ? `${root.replace(/[\\/]+$/, "")}${sep}${relative.split("/").join(sep)}` : "",
		relative,
		filename: relative.slice(relative.lastIndexOf("/") + 1),
	};
}
