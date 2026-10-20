// What GitHub answers for the screenshots: one organization, its repositories, and the skills of
// the one the screenshots scan. A recording, not the network, so every pixel of a baseline comes
// from the same bytes on every machine — a live scan would redraw the page whenever a repository
// gains a skill.
import { type Recording } from '../../src/core/replay.ts';
import { trees } from '../helpers.ts';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** The organization the screenshots scan, and the repository they open from its list. */
export const ORGANIZATION = 'github.com/JetBrains';
export const REPOSITORY = 'https://github.com/JetBrains/kotlin';
/** A repository GitHub does not have: the error moment. */
export const MISSING = 'https://github.com/JetBrains/missing';

const COMMIT: Record<string, string> = {
  kotlin: '5ab6270ab772d113e8ad52ebfcaa0109c522ae00',
  'intellij-community': '1f0c2b8d4e6a9c3b5d7f1a2e4c6b8d0f2a4c6e81',
  MPS: '9c1e3a5b7d9f1b3d5f7a9c1e3a5b7d9f1b3d5f71',
  docs: '3e5a7c9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a12',
};

/** A SKILL.md, as the page shows it: front matter and body, the whole file. */
function file(name: string, description: string, body: string) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
}

const SKILLS: Record<string, string> = {
  '.claude/skills/build-tools-bump-gradle-api/SKILL.md': file(
    'build-tools-bump-gradle-api',
    'Bumps the Gradle API version the Kotlin Gradle plugins are compiled against. Use when a new Gradle release is out.',
    '# Bump the Gradle API\n\n1. Change `gradleApiVersion` in `gradle/libs.versions.toml`.\n2. Run `./gradlew :kotlin-gradle-plugin:check`.\n3. Note the new version in the changelog.\n',
  ),
  '.agents/skills/commits/SKILL.md': file(
    'commits',
    'Write commit messages the way this repository does. Use for every commit.',
    '# Commits\n\nOne line, the imperative mood, no trailing period. The body explains why, not what.\n',
  ),
  '.claude/skills/commits/SKILL.md': file('commits', 'Write commit messages the way this repository does.', '# Commits\n'),
  '.agents/skills/release-checklist/SKILL.md': file(
    'release-checklist',
    'The steps of a release, in order. Use before tagging a version.',
    '# Release checklist\n\n- The tests are green on `main`.\n- The changelog names every user-visible change.\n- The tag is signed.\n',
  ),
};

/** The paths of each repository, skill roots and all; the counts in the list come from these. */
const PATHS: Record<string, string[]> = {
  kotlin: [...Object.keys(SKILLS), 'docs/SKILL.md', 'README.md'],
  'intellij-community': ['.claude/skills/code-style/SKILL.md', '.claude/skills/run-tests/SKILL.md'],
  MPS: ['.github/skills/generate/SKILL.md'],
  docs: ['README.md'],
};

/**
 * GitHub for the screenshots: JetBrains with four repositories, three of them with skills; kotlin
 * scanned in full, down to the SKILL.md of each skill and the one in `docs/` that is flagged;
 * JetBrains/missing not found, so the page shows an error.
 */
export function recording(): Recording {
  const recorded: Recording = {
    [`${API}/users/JetBrains`]: { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
    [`${API}/orgs/JetBrains/repos?per_page=100&page=1`]: {
      status: 200,
      body: Object.keys(PATHS).map((name) => ({ full_name: `JetBrains/${name}`, default_branch: 'main' })),
    },
    [`${API}/repos/JetBrains/missing`]: { status: 404, body: { message: 'Not Found' } },
  };
  for (const [name, paths] of Object.entries(PATHS)) {
    const id = `JetBrains/${name}`;
    const sha = COMMIT[name];
    recorded[`${API}/repos/${id}`] = { status: 200, body: { full_name: id, default_branch: 'main' } };
    recorded[`${API}/repos/${id}/commits/main`] = { status: 200, body: { sha } };
    Object.assign(recorded, trees(id, sha, paths));
    // A scan with a token finds the SKILL.md files outside the skill roots through code search.
    recorded[`${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=1`] = {
      status: 200,
      body: { total_count: paths.filter((path) => path.endsWith('SKILL.md')).length, items: paths.filter((path) => path.endsWith('SKILL.md')).map((path) => ({ path })) },
    };
    for (const [path, text] of Object.entries(SKILLS)) {
      if (paths.includes(path)) recorded[`${RAW}/${id}/${sha}/${path}`] = { status: 200, body: text };
    }
  }
  return recorded;
}
