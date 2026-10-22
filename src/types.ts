// SPDX-License-Identifier: MIT
// Shapes shared by the read model, the move engine, the server and the board page.

/** One stage of the lifecycle. Stage ids are 1-based positions in `config.stages`. */
export type Stage = { id: number; folder: string; name: string };

/** One phase file: `<feature>/phases/NN-slug.md`. */
export type Phase = {
	/** "01", "11b". */
	num: string;
	title: string;
	/** Repo-relative path of the phase file. */
	path: string;
	done: number;
	total: number;
};

/** What one feature has in flight on one branch. File lists are capped; counts are whole. */
export type CardGit = {
	branch: string;
	wip: number;
	staged: number;
	committed: number;
	commits: number;
	pr: { number: number; url: string; draft: boolean; title: string } | null;
	files: { wip: string[]; staged: string[]; committed: string[] };
	/** Why the branch counts for this feature. */
	via: "roadmap" | "branch" | "code";
};

export type Card = {
	/** `<stageId>:<slug>`; a slug can sit in two stages during a migration. */
	id: string;
	slug: string;
	stage: number;
	title: string;
	/** From frontmatter `group:`, else the first matching `config.groups` rule, else `config.defaultGroup`. */
	group: string;
	done: number;
	total: number;
	open: string[];
	phases: number;
	phaseList: Phase[];
	hasFolder: boolean;
	hasList: boolean;
	/** Last commit on the main branch that touched the feature (ms). */
	touchedAt: number | null;
	/** First commit of the feature in any stage, else the file or folder birth time (ms). */
	createdAt: number | null;
	landed: { at: number; sha: string } | null;
	git: CardGit[];
	/** Open decisions: the feature waits on a person. */
	decisions: string[];
	/** Unticked Ops actions: steps only a person can take. */
	ops: string[];
	/** Card ids this feature depends on. */
	deps: string[];
	/** Card ids it mentions otherwise. */
	links: string[];
};

/** `github` is false when pull requests could not be read, null when the board was read without git state. */
export type Board = {
	cards: Card[];
	stages: Stage[];
	groups: string[];
	/** Icon name per configured group; groups without one use the default icon. */
	groupIcons: Record<string, string>;
	roadmapDir: string;
	mainBranch: string;
	readAt: number;
	version: string | null;
	github: boolean | null;
};

export type PathMove = { from: string; to: string };

export type MoveInput = { slug: string; from: number; to: number };

export type MovePlan = MoveInput & {
	moves: PathMove[];
	/** Repo files whose links or mentions change. */
	rewrites: string[];
	/** Why the move cannot run; null when it can. */
	blocked: string | null;
	/** Consequences a person should see before confirming. */
	warnings: string[];
	/** Commands the move runs in its worktree before it commits (hooks, then the lint gate). */
	hooks: string[];
	/** Tracked files that move (the build list and everything in its folder). */
	files: number;
	/** The commit subject the move will write. */
	subject: string;
	/** The main branch commit the move starts from, and the branch name it will use (a timestamp follows). */
	base: string;
	branch: string;
};

export type MoveResult = { plan: MovePlan; commit: string; branch: string };
