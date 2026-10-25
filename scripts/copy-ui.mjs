// SPDX-License-Identifier: MIT
// Writes the board page next to the compiled server: Vite's build of src/web with its script and styles inlined, so the
// server sends one page and serves no other file. Copies the icon set the server injects into it.
import fs from "node:fs";
import path from "node:path";

const built = "dist/web";
const out = "dist/ui";
const asset = (ref) => fs.readFileSync(path.join(built, ref), "utf8");

let html = fs.readFileSync(path.join(built, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, ref) => `<style>${asset(ref).replace(/<\/style/gi, "<\\/style")}</style>`);
html = html.replace(
	/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g,
	(_, ref) => `<script type="module">${asset(ref).replace(/<\/script/gi, "<\\/script")}</script>`,
);
if (/(?:src|href)="\.\//.test(html)) throw new Error("copy-ui: the page still links a built file");
// The server fills the first __ICONS__, __ARCHITECTURE__ and __REPO__ it finds; the bundle must not hold any of them.
for (const token of ["__ICONS__", "__ARCHITECTURE__", "__REPO__"]) {
	if (html.split(token).length !== 2) throw new Error(`copy-ui: ${token} must appear once in the page`);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "board.html"), html);
for (const f of fs.readdirSync("src/ui")) fs.copyFileSync(`src/ui/${f}`, `${out}/${f}`);
fs.rmSync(built, { recursive: true, force: true });
