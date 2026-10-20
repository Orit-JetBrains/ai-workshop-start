/** A skill found in a repository: its SKILL.md, its directory's name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills, at its top; the first one holds a skill, the others its copies. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * Every `<root>/<directory>/SKILL.md`, named after its directory. The same directory in
 * several roots is one skill, at the first root, with copies; a SKILL.md anywhere else is flagged.
 */
export function findSkills(paths: string[]): { files: SkillFile[]; warnings: string[] } {
  const found = new Map<string, string[][]>(); // directory → its SKILL.md in each root, by root
  const warnings: string[] = [];
  for (const path of [...paths].sort()) {
    if (path.split('/').at(-1) !== 'SKILL.md') continue;
    const place = skillPlace(path);
    if (!place) {
      warnings.push(`${path}: not in a skill root; ignored`);
      continue;
    }
    const byRoot = found.get(place.directory) ?? SKILL_ROOTS.map(() => []);
    byRoot[place.root].push(path);
    found.set(place.directory, byRoot);
  }
  const files = [...found].map(([name, byRoot]) => {
    const [path, ...copies] = byRoot.flat();
    return { path, name, copies };
  });
  return { files, warnings };
}

/** For a `<root>/<directory>/SKILL.md`, the root's index and the directory; undefined for any other path. */
function skillPlace(path: string): { root: number; directory: string } | undefined {
  const root = SKILL_ROOTS.findIndex((root) => path.startsWith(`${root}/`));
  if (root < 0) return undefined;
  const rest = path.slice(SKILL_ROOTS[root].length + 1).split('/');
  return rest.length === 2 ? { root, directory: rest[0] } : undefined;
}
