// SPDX-License-Identifier: MIT
// Copy path: the icon button beside a popup's Close. Its menu shows each form of the path, so you see what you copy,
// and copies the one picked.
import { useCallback, useState } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { repoRoot } from "@/lib/boot";
import { Icon } from "@/lib/icon";
import { type PathForm, pathForms } from "@/lib/paths";
import { usePage } from "@/lib/ui";

const FORMS: [PathForm, string][] = [
	["absolute", "Absolute path"],
	["relative", "Relative path"],
	["filename", "Filename"],
];

/**
 * The clipboard API, else a selected textarea and the copy command, for browsers that refuse the API (an embedded
 * preview). The textarea goes in `host`: a modal dialog leaves everything outside it inert.
 */
async function copyText(text: string, host: HTMLElement): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const back = document.activeElement as HTMLElement | null;
		const area = document.createElement("textarea");
		area.value = text;
		area.setAttribute("readonly", "");
		area.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0;";
		host.append(area);
		area.select();
		const done = document.execCommand("copy");
		area.remove();
		back?.focus();
		return done;
	}
}

export function CopyPath({ path }: { path: string }) {
	const { toast } = usePage();
	/* The popups are modal dialogs in the top layer, so a menu portalled to the body would sit under them. */
	const [box, setBox] = useState<HTMLElement | null>(null);
	const anchor = useCallback((el: HTMLElement | null) => setBox(el?.closest("dialog") ?? null), []);
	const forms = pathForms(repoRoot(), path);
	const copy = async (label: string, text: string) => {
		const done = await copyText(text, box ?? document.body);
		toast(done ? `Copied ${label.toLowerCase()}` : `Could not copy the ${label.toLowerCase()}`, { err: !done });
	};
	return (
		<DropdownMenu>
			<DropdownMenuTrigger ref={anchor} className="copy-path" aria-label="Copy path" title="Copy path">
				<Icon name="Copy" />
			</DropdownMenuTrigger>
			<DropdownMenuContent container={box} align="end" className="w-auto max-w-80">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Copy path</DropdownMenuLabel>
					{FORMS.map(([k, label]) => (
						<DropdownMenuItem key={k} disabled={!forms[k]} onClick={() => void copy(label, forms[k])} className="flex-col items-stretch gap-0">
							<span>{label}</span>
							<span className="truncate text-xs text-muted-foreground">{forms[k] || "Not available"}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
