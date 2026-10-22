// SPDX-License-Identifier: MIT
// Copies the board page and its icon set next to the compiled server.
import fs from "node:fs";

fs.mkdirSync("dist/ui", { recursive: true });
for (const f of fs.readdirSync("src/ui")) fs.copyFileSync(`src/ui/${f}`, `dist/ui/${f}`);
