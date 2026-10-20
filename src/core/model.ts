/** A scanned repository. The hierarchy is organization → repository → skill. */
export type Repository = {
  /** `owner/name`, for example `JetBrains/kotlin`; a local directory's name. */
  id: string;
  organization: string;
  name: string;
  /** `https://github.com/<owner>/<repo>`, or a local directory's file:// URL. */
  url: string;
  /** The scanned commit; empty for a local directory. */
  commit: string;
};

/** One skill. Its link is derived, by `skillLink`. */
export type Skill = {
  /** `repo:path`, for example `JetBrains/kotlin:.claude/skills/x/SKILL.md`. */
  id: string;
  repository: string;
  path: string;
  name: string;
  description: string;
  /** The scanned commit, the one the link pins; empty for a local directory. */
  commit: string;
  /**
   * The day of the last commit that touched the SKILL.md, `YYYY-MM-DD` in UTC; the newest of the
   * skill's copies. Empty when there is no history to read it from.
   */
  updatedAt: string;
  /** The same skill in other agents' folders. */
  copies: string[];
};

/**
 * The SKILL.md file, from where its repository is: on GitHub at the scanned commit,
 * `https://github.com/<owner>/<repo>/blob/<commit>/<path>`; in a local directory, the file itself.
 */
export function skillLink(repository: Repository, skill: Skill): string {
  const path = skill.path.split('/').map(encodeURIComponent).join('/');
  return skill.commit ? `${repository.url}/blob/${skill.commit}/${path}` : `${repository.url}/${path}`;
}

/**
 * The day a skill was last changed, out of its files' last commits: the **newest** of them, as a
 * skill mirrored into several folders is as fresh as its freshest copy. An absolute date, in UTC,
 * so what is printed and drawn does not move with the machine's day or its zone; empty when no
 * file had a date at all.
 */
export function newestDay(instants: (string | undefined)[]): string {
  const times = instants.flatMap((instant) => {
    const time = instant === undefined ? Number.NaN : Date.parse(instant);
    return Number.isNaN(time) ? [] : [time];
  });
  return times.length > 0 ? new Date(Math.max(...times)).toISOString().slice(0, 10) : '';
}

/** One repository of an organization, with how many project skills it has. */
export type RepositorySkills = {
  /** `owner/name`, for example `JetBrains/kotlin`. */
  id: string;
  /** The repository's own name, without the owner: the organization is printed above it. */
  name: string;
  skills: number;
};

/** The same order everywhere, whatever the locale. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** By name, then by path: the same order everywhere, whatever the locale. */
export function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => compare(a.name, b.name) || compare(a.path, b.path));
}

/** By name, then by owner: two owners can have a repository of the same name. */
export function sortRepositories(repositories: RepositorySkills[]): RepositorySkills[] {
  return [...repositories].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));
}
