/** A skill found in a repository: its SKILL.md, its directory's name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills, at its top; the first one holds a skill, the others its copies. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * Every `<root>/<directory>/SKILL.md`, named after its directory. The same directory in
 * several roots is one skill, at the first root, with copies; a SKILL.md anywhere else is flagged.
 */
export function findSkills(paths: string[]): { files: SkillFile[]; warnings: string[] } {
  const places: { path: string; root: number; directory: string }[] = [];
  const warnings: string[] = [];
  for (const path of [...paths].sort()) {
    if (path.split('/').at(-1) !== 'SKILL.md') continue;
    const place = skillPlace(path);
    if (place) places.push({ path, ...place });
    else warnings.push(`${path}: not in a skill root; ignored`);
  }
  const found = new Map<string, string[]>(); // directory → its SKILL.md files, in root order
  for (const { path, directory } of places.sort((a, b) => a.root - b.root)) {
    found.set(directory, [...(found.get(directory) ?? []), path]);
  }
  const files = [...found].map(([name, [path, ...copies]]) => ({ path, name, copies }));
  return { files, warnings };
}

/** For a `<root>/<directory>/SKILL.md`, the root's index and the directory; undefined for any other path. */
function skillPlace(path: string): { root: number; directory: string } | undefined {
  const root = SKILL_ROOTS.findIndex((root) => path.startsWith(`${root}/`));
  if (root < 0) return undefined;
  const rest = path.slice(SKILL_ROOTS[root].length + 1).split('/');
  return rest.length === 2 ? { root, directory: rest[0] } : undefined;
}
