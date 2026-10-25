// SPDX-License-Identifier: MIT
// What the server writes into the page before the bundle runs: the icon set, whether the Architecture view shows and
// the repo's folder name.

export type IconPaths = { light: string[]; regular: string[] };
type Boot = { icons: Record<string, IconPaths>; architecture: boolean; repo?: string };

const boot = (): Boot => (globalThis as { GITBOARD?: Boot }).GITBOARD ?? { icons: {}, architecture: false };

export const icons = (): Record<string, IconPaths> => boot().icons;
/** True when gitboard.config.json has an architecture block: the Architecture tab shows beside the Roadmap board. */
export const architectureOn = (): boolean => boot().architecture;
/** The repo's folder name, for the sidebar header. */
export const repoName = (): string => boot().repo || "Repository";
