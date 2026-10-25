// SPDX-License-Identifier: MIT
// Page-wide parts: toasts, the screen reader announcer and the native modal dialog.
import { createContext, type ReactNode, type Ref, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icon";

type ToastOptions = { err?: boolean; undo?: () => void };
type Toast = ToastOptions & { id: number; text: string };
type Page = { toast: (text: string, opts?: ToastOptions) => void; say: (text: string) => void };

const PageContext = createContext<Page | null>(null);
/** Moves the toasts into the open modal dialog: a Modal calls it on opening, so a toast already showing stays usable. */
const RehostContext = createContext<(() => void) | null>(null);

/** The open modal dialog, if any: the toasts go inside it, since a modal dialog leaves everything outside it inert. */
const openModal = () => [...document.querySelectorAll<HTMLDialogElement>("dialog:modal")].at(-1) ?? null;

export function usePage(): Page {
	const page = useContext(PageContext);
	if (!page) throw new Error("usePage outside PageProvider");
	return page;
}

export function PageProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [said, setSaid] = useState("");
	const [host, setHost] = useState<HTMLDialogElement | null>(null);
	const stack = useRef<HTMLDivElement>(null);
	const next = useRef(0);
	const drop = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
	const toast = useCallback(
		(text: string, opts: ToastOptions = {}) => {
			const id = ++next.current;
			setHost(openModal());
			setToasts((list) => [...list, { ...opts, id, text }]);
			setTimeout(() => drop(id), opts.err ? 10000 : 8000);
		},
		[drop],
	);
	// Clear first, then set on the next frame, so the same words twice are announced twice.
	const say = useCallback((text: string) => {
		setSaid("");
		requestAnimationFrame(() => setSaid(text));
	}, []);
	const page = useRef<Page>({ toast, say }).current;
	const rehost = useCallback(() => setHost(openModal()), []);
	// When the dialog holding the toasts closes, they move to the dialog still open under it, else back to the page.
	useEffect(() => {
		if (!host) return;
		const off = () => setHost(openModal());
		host.addEventListener("close", off);
		return () => host.removeEventListener("close", off);
	}, [host]);
	/* The stack is a popover, so it shows in the top layer: above the modal dialogs, which no z-index can pass. A move
	   between hosts mounts a new stack, which shows itself here. */
	useLayoutEffect(() => {
		const el = stack.current;
		if (!el) return;
		const open = el.matches(":popover-open");
		if (toasts.length && !open) el.showPopover();
		else if (!toasts.length && open) el.hidePopover();
	});
	return (
		<PageContext.Provider value={page}>
			<RehostContext.Provider value={rehost}>{children}</RehostContext.Provider>
			{createPortal(
				<div className="toasts" id="toasts" aria-live="polite" popover="manual" ref={stack}>
					{toasts.map((t) => (
						<div key={t.id} className={`toast${t.err ? " err" : ""}`} role={t.err ? "alert" : "status"}>
							<span>{t.text}</span>
							{t.undo ? (
								<button
									type="button"
									className="btn"
									onClick={() => {
										drop(t.id);
										t.undo?.();
									}}
								>
									<Icon name="ArrowCounterClockwise" />
									Undo
								</button>
							) : null}
						</div>
					))}
				</div>,
				host ?? document.body,
			)}
			<p className="sr-only" id="announce" aria-live="assertive">
				{said}
			</p>
		</PageContext.Provider>
	);
}

export type ModalHandle = { close: () => void; el: HTMLDialogElement | null };

/**
 * A native modal dialog. `open` shows it with showModal; Escape or `close()` closes it and calls
 * `onClose` (a backdrop click only when `backdrop` is set). Its content stays after closing, so the closing fade still shows it. `[data-autofocus]` takes focus on open.
 */
export function Modal({
	open,
	onClose,
	onCancel,
	className,
	labelledBy,
	id,
	backdrop = false,
	ref,
	children,
}: {
	open: boolean;
	onClose: () => void;
	/** Escape: call `preventDefault` on the event to keep the dialog open. */
	onCancel?: (e: Event) => void;
	className?: string;
	labelledBy: string;
	id: string;
	backdrop?: boolean;
	ref?: Ref<ModalHandle>;
	children: ReactNode;
}) {
	const el = useRef<HTMLDialogElement>(null);
	const rehost = useContext(RehostContext);
	useImperativeHandle(ref, () => ({ close: () => el.current?.close(), el: el.current }), []);
	useLayoutEffect(() => {
		const d = el.current;
		if (!d) return;
		if (open && !d.open) {
			d.showModal();
			rehost?.();
			d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
		} else if (!open && d.open) d.close();
	}, [open]);
	const closeRef = useRef(onClose);
	const cancelRef = useRef(onCancel);
	closeRef.current = onClose;
	cancelRef.current = onCancel;
	useEffect(() => {
		const d = el.current!;
		const close = () => closeRef.current();
		const cancel = (e: Event) => cancelRef.current?.(e);
		d.addEventListener("close", close);
		d.addEventListener("cancel", cancel);
		return () => {
			d.removeEventListener("close", close);
			d.removeEventListener("cancel", cancel);
		};
	}, []);
	return (
		<dialog ref={el} id={id} className={className} aria-labelledby={labelledBy} onClick={(e) => backdrop && e.target === el.current && el.current.close()}>
			{children}
		</dialog>
	);
}
