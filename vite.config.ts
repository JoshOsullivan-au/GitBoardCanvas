// SPDX-License-Identifier: MIT
// Builds the board page from src/web. `scripts/copy-ui.mjs` then inlines the script and styles into dist/ui/board.html,
// so the server sends one page and no other file.
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const web = path.resolve(import.meta.dirname, "src/web");

export default defineConfig({
	root: web,
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": web } },
	build: {
		outDir: path.resolve(import.meta.dirname, "dist/web"),
		emptyOutDir: true,
		modulePreload: false,
		cssCodeSplit: false,
		assetsInlineLimit: Number.MAX_SAFE_INTEGER,
		reportCompressedSize: true,
	},
});
