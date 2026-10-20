import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
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
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

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
  const skill: Skill = {
    id: `${source.repository.id}:${main.path}`,
    repository: source.repository.id,
    path: main.path,
    name,
    description: main.parsed.description,
    commit: source.repository.commit,
    copies: copies.map((copy) => copy.path),
  };
  return { skill, warnings };
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
