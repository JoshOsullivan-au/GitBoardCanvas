// SPDX-License-Identifier: MIT
// What the server writes into the page before the bundle runs: the icon set and whether the Architecture tab shows.

export type IconPaths = { light: string[]; regular: string[] };
type Boot = { icons: Record<string, IconPaths>; architecture: boolean };

const boot = (): Boot => (globalThis as { GITBOARD?: Boot }).GITBOARD ?? { icons: {}, architecture: false };

export const icons = (): Record<string, IconPaths> => boot().icons;
/** True when gitboard.config.json has an architecture block: the Architecture tab shows beside the Roadmap board. */
export const architectureOn = (): boolean => boot().architecture;
