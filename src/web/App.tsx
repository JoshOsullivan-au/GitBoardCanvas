// SPDX-License-Identifier: MIT
// The board page: the shell (sidebar and top bar) around the Roadmap board, and the Architecture view when
// gitboard.config.json has an architecture block. Each view puts its tools in the top bar.
import { useState } from "react";

import { Shell } from "./components/shell";
import { Architecture } from "./architecture/Architecture";
import { architectureOn } from "./lib/boot";
import { useView } from "./lib/shell";
import { PageProvider } from "./lib/ui";
import { Roadmap } from "./roadmap/Roadmap";

export function App() {
	const arch = architectureOn();
	const view = useView(arch);
	const [roadmapTools, setRoadmapTools] = useState<HTMLDivElement | null>(null);
	const [archTools, setArchTools] = useState<HTMLDivElement | null>(null);
	return (
		<PageProvider>
			<Shell
				view={view}
				arch={arch}
				tools={
					<>
						<div className="tools" data-view="roadmap" hidden={view !== "roadmap"} ref={setRoadmapTools}></div>
						{arch ? <div className="tools" data-view="architecture" hidden={view !== "architecture"} ref={setArchTools}></div> : null}
					</>
				}
			>
				<div className="scroll" id="scroll" role="region" aria-label="Roadmap" hidden={view !== "roadmap"}>
					<Roadmap tools={roadmapTools} />
				</div>
				{arch ? (
					<div className="scroll" id="archScroll" role="region" aria-label="Architecture" hidden={view !== "architecture"}>
						<Architecture active={view === "architecture"} tools={archTools} />
					</div>
				) : null}
			</Shell>
		</PageProvider>
	);
}
