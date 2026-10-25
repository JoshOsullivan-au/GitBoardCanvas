// SPDX-License-Identifier: MIT
// A doc the sidebar or the Lifecycle menu opened, in the board's dialog. Links to another doc the server serves open
// in place; Back returns along the trail.
import { useRef, useState } from "react";

import { api } from "@/lib/api";
import { firstLine } from "@/lib/format";
import { Icon } from "@/lib/icon";
import { Markdown } from "@/lib/markdown";
import { Modal, type ModalHandle, usePage } from "@/lib/ui";

import type { Doc } from "./AppSidebar";

type Shown = Doc & { html: string };

export function useDocDialog(roadmapDir: string | null, docs: Doc[]) {
	const { toast } = usePage();
	const [trail, setTrail] = useState<Shown[]>([]);
	const [open, setOpen] = useState(false);
	const modal = useRef<ModalHandle>(null);
	const back = useRef<HTMLButtonElement>(null);
	const close = useRef<HTMLButtonElement>(null);

	const show = async (d: Doc, push: boolean) => {
		let html: string;
		try {
			({ html } = await api<{ html: string }>(`/api/doc?path=${encodeURIComponent(d.path)}`));
		} catch (error) {
			toast(firstLine((error as Error).message), { err: true });
			return;
		}
		setTrail((t) => (push ? [...t, { ...d, html }] : [{ ...d, html }]));
		setOpen(true);
	};
	const onLink = (next: string) => {
		const known = docs.find((d) => d.path === next);
		if (known) void show(known, true);
		else if (roadmapDir && next.startsWith(`${roadmapDir}/`) && next.endsWith(".md")) void show({ label: next.split("/").slice(-2).join("/"), path: next }, true);
	};
	const view = trail[trail.length - 1];
	const dialog = (
		<Modal
			id="docDialog"
			className="wide doc-mode"
			labelledBy="doc-title"
			open={open}
			/* The trail stays for the closing fade; the next doc opened starts a new one. */
			onClose={() => setOpen(false)}
			backdrop
			ref={modal}
		>
			{view ? (
				<div className="dlg">
					<button type="button" className="x" aria-label="Close" ref={close} data-autofocus={trail.length > 1 ? undefined : ""} onClick={() => modal.current?.close()}>
						<Icon name="X" />
					</button>
					<div className="doc-head">
						{trail.length > 1 ? (
							<button type="button" className="icon-btn" data-back data-autofocus aria-label="Back" ref={back} onClick={() => setTrail((t) => t.slice(0, -1))}>
								<Icon name="CaretLeft" />
							</button>
						) : null}
						<span className="crumb" id="doc-title">
							{view.label}
						</span>
					</div>
					<Markdown html={view.html} path={view.path} onLink={onLink} onShown={() => (back.current ?? close.current)?.focus()} />
				</div>
			) : null}
		</Modal>
	);
	return { openDoc: (d: Doc) => void show(d, false), dialog };
}
