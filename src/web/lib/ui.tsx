// SPDX-License-Identifier: MIT
// Page-wide parts: toasts, the screen reader announcer and the native modal dialog.
import { createContext, type ReactNode, type Ref, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "./icon";

type ToastOptions = { err?: boolean; undo?: () => void };
type Toast = ToastOptions & { id: number; text: string };
type Page = { toast: (text: string, opts?: ToastOptions) => void; say: (text: string) => void };

const PageContext = createContext<Page | null>(null);

export function usePage(): Page {
	const page = useContext(PageContext);
	if (!page) throw new Error("usePage outside PageProvider");
	return page;
}

export function PageProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [said, setSaid] = useState("");
	const next = useRef(0);
	const drop = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
	const toast = useCallback(
		(text: string, opts: ToastOptions = {}) => {
			const id = ++next.current;
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
	return (
		<PageContext.Provider value={page}>
			{children}
			<div className="toasts" id="toasts" aria-live="polite">
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
			</div>
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
	useImperativeHandle(ref, () => ({ close: () => el.current?.close(), el: el.current }), []);
	useLayoutEffect(() => {
		const d = el.current;
		if (!d) return;
		if (open && !d.open) {
			d.showModal();
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
