// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  ...trees('JetBrains/example', EXAMPLE_COMMIT, ['.claude/skills/commits/SKILL.md']),
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

const github = replay(EXAMPLE);

/**
 * What GitHub answers for the trees of a repository with these files: each directory's, alone and
 * recursive. A path ending in ` ->` is a symbolic link; the directories in `truncated` are too large
 * for one recursive answer (`''` is the repository's root).
 */
export function trees(id: string, commit: string, paths: string[], truncated: string[] = []): Recording {
  const entries = paths.map((path) => (path.endsWith(' ->') ? { path: path.slice(0, -3), mode: '120000' } : { path, mode: '100644' }));
  const directories = new Set(['']);
  for (const { path } of entries) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  const sha = (directory: string) => (directory ? `tree-${directory.replaceAll('/', '-')}` : commit);
  const below = (directory: string, path: string) => (directory ? path.slice(directory.length + 1) : path);
  const inside = (directory: string, path: string) => !directory || path.startsWith(`${directory}/`);
  const recording: Recording = {};
  for (const directory of directories) {
    const subdirectories = [...directories].filter((other) => other && other !== directory && inside(directory, other));
    const all = [
      ...subdirectories.map((other) => ({ path: below(directory, other), mode: '040000', type: 'tree', sha: sha(other) })),
      ...entries.filter((entry) => inside(directory, entry.path)).map((entry) => ({ path: below(directory, entry.path), mode: entry.mode, type: 'blob', sha: 'blob' })),
    ];
    const url = `https://api.github.com/repos/${id}/git/trees/${sha(directory)}`;
    recording[url] = { status: 200, body: { truncated: false, tree: all.filter((item) => !item.path.includes('/')) } };
    recording[`${url}?recursive=1`] = { status: 200, body: { truncated: truncated.includes(directory), tree: truncated.includes(directory) ? [] : all } };
  }
  return recording;
}

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    // With a token, through code search, as EXAMPLE answers it.
    open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input)),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
