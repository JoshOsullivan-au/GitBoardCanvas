// SPDX-License-Identifier: MIT
// The board page: a header with the view tabs and each view's tools, the Roadmap board, and the Architecture tab when
// gitboard.config.json has an architecture block.
import { useState } from "react";

import { Architecture } from "./architecture/Architecture";
import { architectureOn } from "./lib/boot";
import { Icon } from "./lib/icon";
import { loadText, save } from "./lib/storage";
import { PageProvider } from "./lib/ui";
import { Roadmap } from "./roadmap/Roadmap";

type Tab = "roadmap" | "architecture";

function ThemeButton() {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
	return (
		<button
			type="button"
			className="icon-btn"
			id="theme"
			aria-label="Switch theme"
			onClick={() => {
				document.documentElement.classList.toggle("dark", !dark);
				save("gitboard-theme", dark ? "light" : "dark");
				setDark(!dark);
			}}
		>
			<Icon name={dark ? "Sun" : "Moon"} />
		</button>
	);
}

export function App() {
	const arch = architectureOn();
	/* Roadmap first and the default; the tab a viewer last chose is remembered. */
	const [tab, setTab] = useState<Tab>(() => (arch && loadText("gitboard-tab") === "architecture" ? "architecture" : "roadmap"));
	const [roadmapTools, setRoadmapTools] = useState<HTMLDivElement | null>(null);
	const [archTools, setArchTools] = useState<HTMLDivElement | null>(null);
	const choose = (t: Tab) => {
		setTab(t);
		save("gitboard-tab", t);
	};
	return (
		<PageProvider>
			<main className="page">
				<header className="ph-head">
					<div className="ph-left">
						<h1>GitBoard Canvas</h1>
						{arch ? (
							<div className="tabs" role="tablist" aria-label="View">
								{(["roadmap", "architecture"] as const).map((t) => (
									<button
										key={t}
										type="button"
										className="opt"
										role="tab"
										id={`tab-${t}`}
										aria-selected={tab === t}
										aria-pressed={tab === t}
										aria-controls={t === "roadmap" ? "scroll" : "archScroll"}
										data-tab={t}
										onClick={() => choose(t)}
									>
										{t === "roadmap" ? "Roadmap" : "Architecture"}
									</button>
								))}
							</div>
						) : null}
					</div>
					<div className="tools">
						<div className="tools" data-view="roadmap" hidden={tab !== "roadmap"} ref={setRoadmapTools}></div>
						{arch ? <div className="tools" data-view="architecture" hidden={tab !== "architecture"} ref={setArchTools}></div> : null}
						<ThemeButton />
					</div>
				</header>
				<div className="scroll" id="scroll" hidden={tab !== "roadmap"} {...(arch ? { role: "tabpanel", "aria-labelledby": "tab-roadmap" } : {})}>
					<Roadmap tools={roadmapTools} />
				</div>
				{arch ? (
					<div className="scroll" id="archScroll" role="tabpanel" aria-labelledby="tab-architecture" hidden={tab !== "architecture"}>
						<Architecture active={tab === "architecture"} tools={archTools} />
					</div>
				) : null}
			</main>
		</PageProvider>
	);
}
