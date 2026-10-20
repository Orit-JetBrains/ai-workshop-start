import { AtlasError } from './errors.ts';
import { findSkills, type SkillFile } from './find.ts';
import { newestDay, sortRepositories, sortSkills, type Repository, type RepositorySkills, type Skill } from './model.ts';
import { parseSkill, type ParsedSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
  /**
   * When the file was last changed, as an ISO-8601 instant, or undefined when the repository has no
   * history that says. A source that cannot tell at all leaves this out, and the skills have no date.
   */
  updated?(path: string): Promise<string | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** An organization or user account to scan: its repositories, and how to list one's skill roots. */
export type OrganizationSource = {
  /** The account's own name, as GitHub spells it. */
  organization: string;
  /** Every repository, as `owner/name`. */
  repositories: string[];
  /** What listing the repositories had to leave out. */
  warnings: string[];
  /** Every file in the repository's skill roots, as a scan's paths, but from those roots alone. */
  paths(repository: string): Promise<string[]>;
};

export type OrganizationScanResult = {
  organization: string;
  /** How many repositories the account has. */
  repositories: number;
  /** Only the repositories that have skills, sorted by name. */
  withSkills: RepositorySkills[];
  warnings: string[];
};

/** How many repositories are read at the same time: an organization has hundreds of them. */
const AT_A_TIME = 8;

/**
 * Every repository of an organization, and how many project skills it has: the same rules as a
 * scan's, counted from the skill roots alone. Nothing is stored: the result is all there is.
 */
export async function scanOrganization(source: OrganizationSource): Promise<OrganizationScanResult> {
  const counted = await eachAtATime(source.repositories, AT_A_TIME, async (id) => {
    try {
      // The skills of a repository, as findSkills counts them: copies are one skill, links are skipped.
      const skills = findSkills(await source.paths(id)).files.length;
      return { repository: { id, name: id.split('/').at(-1) ?? id, skills }, warnings: [] };
    } catch (error) {
      // A rate limit stops the whole scan: every repository after it would only fail the same way.
      if (error instanceof AtlasError && /rate limit/i.test(error.message)) throw error;
      return { warnings: [`${id}: ${error instanceof Error ? error.message : String(error)}; skipped`] };
    }
  });
  const found = counted.flatMap((each) => (each.repository && each.repository.skills > 0 ? [each.repository] : []));
  return {
    organization: source.organization,
    repositories: source.repositories.length,
    withSkills: sortRepositories(found),
    // In the repositories' own order, whichever one answered first.
    warnings: [...source.warnings, ...counted.flatMap((each) => each.warnings)],
  };
}

/** `work` over each item, at most `limit` of them at a time, in the items' order. */
async function eachAtATime<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const found = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(found.files.map((file) => readSkill(source, file)));
  return {
    repository: source.repository,
    skills: sortSkills(results.flatMap((result) => (result.skill ? [result.skill] : []))),
    warnings: [...source.warnings, ...found.warnings, ...results.flatMap((result) => result.warnings)],
  };
}

/** The skill from its first readable file; the others are its copies, which only have to have the same name. */
async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warnings: string[] }> {
  const read = await Promise.all([file.path, ...file.copies].map((path) => readFile(source, path)));
  const warnings = read.flatMap((each) => each.warnings);
  const [main, ...copies] = read.filter((each): each is Read & { parsed: ParsedSkill } => each.parsed !== undefined);
  if (!main) {
    // Not one file read: an error, a rate limit say, is the scan's; for a copy, it only costs a warning.
    const failed = read.find((each) => each.error !== undefined);
    if (failed) throw failed.error;
    return { warnings };
  }
  const name = main.parsed.name ?? file.name;
  for (const copy of copies) {
    // A copy whose front matter cannot be read has no name of its own to compare.
    const copyName = copy.parsed.name ?? file.name;
    if (!copy.parsed.warning && copyName !== name) warnings.push(`${copy.path}: a copy of ${main.path}, but named ${copyName}`);
  }
  // The date of every file of the skill, the newest of which is the skill's. On GitHub each one is
  // a request, so the files are asked about at the same time, as their contents were.
  const dates = await Promise.all([main, ...copies].map((each) => readDate(source, each.path)));
  warnings.push(...dates.flatMap((date) => date.warnings));
  const skill: Skill = {
    id: `${source.repository.id}:${main.path}`,
    repository: source.repository.id,
    path: main.path,
    name,
    description: main.parsed.description,
    commit: source.repository.commit,
    updatedAt: newestDay(dates.map((date) => date.updated)),
    copies: copies.map((copy) => copy.path),
  };
  return { skill, warnings };
}

/**
 * When a file was last changed. A date is not the skill itself: a source that cannot answer for one
 * costs a warning and an empty date, not the scan. A rate limit is the exception — every request
 * after it would fail the same way, dates and files alike, so it ends the scan as it always has.
 */
async function readDate(source: Source, path: string): Promise<{ updated?: string; warnings: string[] }> {
  if (!source.updated) return { warnings: [] };
  try {
    return { updated: await source.updated(path), warnings: [] };
  } catch (error) {
    if (error instanceof AtlasError && /rate limit/i.test(error.message)) throw error;
    return { warnings: [`${path}: ${error instanceof Error ? error.message : String(error)}; no date`] };
  }
}

type Read = { path: string; parsed?: ParsedSkill; warnings: string[]; error?: unknown };

async function readFile(source: Source, path: string): Promise<Read> {
  let bytes: Uint8Array | undefined;
  try {
    bytes = await source.read(path);
  } catch (error) {
    return { path, warnings: [`${path}: ${error instanceof Error ? error.message : String(error)}; skipped`], error };
  }
  if (!bytes) return { path, warnings: [`${path}: listed, but not found at the scanned commit; skipped`] };
  const parsed = parseSkill(new TextDecoder().decode(bytes));
  return { path, parsed, warnings: parsed.warning ? [`${path}: ${parsed.warning}`] : [] };
}
