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

/** The skill from its first file; a copy only has to be there and have the same name. */
async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warnings: string[] }> {
  const [main, ...copies] = await Promise.all([file.path, ...file.copies].map((path) => readFile(source, path)));
  if (!main.parsed) return { warnings: main.warnings };
  const name = main.parsed.name ?? file.name;
  const warnings = [...main.warnings];
  const present: string[] = [];
  for (const copy of copies) {
    warnings.push(...copy.warnings);
    if (!copy.parsed) continue;
    present.push(copy.path);
    const copyName = copy.parsed.name ?? file.name;
    if (copyName !== name) warnings.push(`${copy.path}: a copy of ${file.path}, but named ${copyName}`);
  }
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name,
    description: main.parsed.description,
    commit: source.repository.commit,
    copies: present,
  };
  return { skill, warnings };
}

async function readFile(source: Source, path: string): Promise<{ path: string; parsed?: ParsedSkill; warnings: string[] }> {
  const bytes = await source.read(path);
  if (!bytes) return { path, warnings: [`${path}: listed, but not found at the scanned commit; skipped`] };
  const parsed = parseSkill(new TextDecoder().decode(bytes));
  return { path, parsed, warnings: parsed.warning ? [`${path}: ${parsed.warning}`] : [] };
}
