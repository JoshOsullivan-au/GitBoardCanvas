// SPDX-License-Identifier: MIT
// shadcn/ui's class helper: joins class names and lets later Tailwind utilities win over earlier ones.
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
