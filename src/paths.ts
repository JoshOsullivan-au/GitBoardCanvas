// SPDX-License-Identifier: MIT
import fs from "node:fs";
import path from "node:path";

/**
 * Whether `p`, or any folder between `root` and `p`, is a symlink. A writer that finds one stops, so nothing it
 * creates can land outside the repo through a link it did not make. Parts that do not exist yet are not links.
 */
export function linkOnPath(root: string, p: string): boolean {
	let at = root;
	for (const part of path.relative(root, p).split(path.sep).filter(Boolean)) {
		at = path.join(at, part);
		let st: fs.Stats;
		try {
			st = fs.lstatSync(at);
		} catch {
			return false;
		}
		if (st.isSymbolicLink()) return true;
	}
	return false;
}
