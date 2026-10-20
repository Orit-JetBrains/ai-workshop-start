// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture, for directories the tests make, and for small GitHub repositories answered from recordings.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, type TestContext } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { run } from '../src/commands.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, lastCommits, SKILL_DATE, SKILL_DAY, trees } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

/**
 * The output with every date line put back to `updated <date>`: this checkout's own history is the
 * fixture's, and a clone of it — CI's shallow one included — dates the files differently.
 */
function undated(output: string): string {
  return output.replace(/^ {2}updated \d{4}-\d{2}-\d{2}$/gm, '  updated <date>');
}

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  updated ${SKILL_DAY}`,
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every project skill, sorted by name, linked to its file, with its copies and warnings', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    undated(fixture.stdout),
    [
      'fixture · 6 skills',
      "code-style — Follow the project's code style.",
      '  updated <date>',
      `  ${root}/.github/skills/code-style/SKILL.md`,
      '  also in agent/skills/code-style/SKILL.md',
      'commits — Write commit messages the way this repository does.',
      '  updated <date>',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in agent/skills/commits/SKILL.md',
      'deploy',
      '  updated <date>',
      `  ${root}/.claude/skills/deploy/SKILL.md`,
      'release-checklist',
      '  updated <date>',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
      'review — Review a change before it is merged (review-a).',
      '  updated <date>',
      `  ${root}/.claude/skills/review-a/SKILL.md`,
      'review — Review a change before it is merged (review-b).',
      '  updated <date>',
      `  ${root}/.claude/skills/review-b/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /m);
});

test('a SKILL.md outside <root>/<directory>/ → not a skill, and a warning', () => {
  const root = pathToFileURL(FIXTURE).href;
  for (const path of [
    'SKILL.md',
    'docs/SKILL.md',
    '.claude/skills/SKILL.md',
    '.claude/skills/commits/references/SKILL.md',
    'plugins/tools/.claude/skills/nested/SKILL.md',
  ]) {
    assert.match(fixture.stderr, new RegExp(`^warning: ${escape(path)}: not in a skill root; ignored$`, 'm'));
    assert.doesNotMatch(fixture.stdout, new RegExp(`^  ${escape(`${root}/${path}`)}$`, 'm'));
  }
});

test('not named exactly SKILL.md, or another file in a skill root → not a skill, no warning', () => {
  for (const path of ['skill.md', 'lowercase', 'INDEX.md', 'examples.md']) {
    assert.doesNotMatch(fixture.stdout, new RegExp(escape(path)));
    assert.doesNotMatch(fixture.stderr, new RegExp(escape(path)));
  }
});

test('the same directory in several roots → one skill at the first root, its copies listed', () => {
  assert.equal(fixture.stdout.match(/^commits — /gm)?.length, 1);
  assert.match(fixture.stdout, /\.claude\/skills\/commits\/SKILL\.md\n  also in agent\/skills\/commits\/SKILL\.md$/m);
  assert.doesNotMatch(fixture.stderr, /agent\/skills\/commits/);
});

test('a copy under another name → still one skill, and a warning', () => {
  assert.equal(fixture.stdout.match(/^code-style — /gm)?.length, 1);
  assert.doesNotMatch(fixture.stdout, /^style/m);
  assert.match(
    fixture.stderr,
    /^warning: agent\/skills\/code-style\/SKILL\.md: a copy of \.github\/skills\/code-style\/SKILL\.md, but named style$/m,
  );
});

test('different directories with the same name → two skills, sorted by path', () => {
  assert.match(
    undated(fixture.stdout),
    /^review — .*\(review-a\)\.\n  updated <date>\n.*review-a\/SKILL\.md\nreview — .*\(review-b\)\.\n  updated <date>\n.*review-b\/SKILL\.md$/m,
  );
});

test('no description → the skill is listed by name alone', () => {
  assert.match(undated(fixture.stdout), /^deploy\n  updated <date>\n  .*\/\.claude\/skills\/deploy\/SKILL\.md$/m);
});

test('symbolic links are not followed: a linked file, directory or skill root is skipped', async (t) => {
  const directory = temporary(t, {
    '.agents/skills/real/SKILL.md': '---\nname: real\ndescription: A real skill.\n---\n',
    'elsewhere/linked/SKILL.md': '---\nname: linked\ndescription: Only reached through a link.\n---\n',
  });
  for (const path of ['.github/skills', 'agent/skills/file']) mkdirSync(join(directory, path), { recursive: true });
  mkdirSync(join(directory, '.claude'));
  symlinkSync('../.agents/skills', join(directory, '.claude/skills'));
  symlinkSync('../../elsewhere/linked', join(directory, '.github/skills/linked'));
  symlinkSync('../../../elsewhere/linked/SKILL.md', join(directory, 'agent/skills/file/SKILL.md'));
  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['repo · 1 skill', 'real — A real skill.', `  ${pathToFileURL(directory).href}/.agents/skills/real/SKILL.md`].join('\n'));
  assert.match(scanned.stderr, /^warning: elsewhere\/linked\/SKILL\.md: not in a skill root; ignored$/);
});

test('a local directory: node_modules and .git are not part of it', async (t) => {
  const directory = temporary(t, {
    'node_modules/some-package/.claude/skills/theirs/SKILL.md': '---\nname: theirs\n---\n',
    '.git/SKILL.md': '---\nname: git\n---\n',
  });
  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.stdout, 'repo · 0 skills');
  assert.equal(scanned.stderr, '');
});

test('no project skills → 0 skills, exit code 0', async (t) => {
  const scanned = await atlas(['scan', temporary(t, { 'README.md': '# Nothing here\n' })]);
  assert.equal(scanned.code, 0);
  assert.equal(scanned.stdout, 'repo · 0 skills');
});

test('GitHub, code search: a SKILL.md outside the skill roots is flagged, a skill.md is not', async () => {
  const scanned = await scanGitHub(
    {
      ...repository(),
      ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md']),
      ...search(['.claude/skills/a/SKILL.md', 'docs/SKILL.md', '.claude/skills/b/skill.md']),
      ...file('.claude/skills/a/SKILL.md', SKILL_A),
    },
    'test',
  );
  assert.equal(scanned.stdout, ONLY_A);
  assert.equal(scanned.stderr, 'warning: docs/SKILL.md: not in a skill root; ignored');
});

test('GitHub, code search: a symbolic link in a skill root is skipped, as the tree tells', async () => {
  const scanned = await scanGitHub(
    {
      ...repository(),
      ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md', '.claude/skills/linked/SKILL.md ->']),
      ...search(['.claude/skills/a/SKILL.md', '.claude/skills/linked/SKILL.md']),
      ...file('.claude/skills/a/SKILL.md', SKILL_A),
    },
    'test',
  );
  assert.equal(scanned.stdout, ONLY_A);
  assert.equal(scanned.stderr, '');
});

test('GitHub, code search past 1000 results: no skill is lost, and a warning says what is not flagged', async () => {
  const vendored = Array.from({ length: 1000 }, (_, i) => `third_party/p${i}/SKILL.md`);
  const pages: Recording = {};
  for (let page = 1; page <= 10; page++) {
    pages[`${API}/search/code?q=filename:SKILL.md+repo:JetBrains/edge&per_page=100&page=${page}`] = {
      status: 200,
      body: { total_count: 1001, items: vendored.slice((page - 1) * 100, page * 100).map((path) => ({ path })) },
    };
  }
  const scanned = await scanGitHub(
    { ...repository(), ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md']), ...pages, ...file('.claude/skills/a/SKILL.md', SKILL_A) },
    'test',
  );
  assert.equal(scanned.stdout, ONLY_A);
  const warnings = scanned.stderr.split('\n');
  assert.equal(warnings[0], 'warning: code search stops at 1000 SKILL.md files; the others outside .agents/skills, .claude/skills, .github/skills, agent/skills are not flagged');
  assert.equal(warnings.length, 1001);
});

test('GitHub, the tree: a symbolic link is skipped, a SKILL.md outside the skill roots is flagged', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md', '.github/skills ->', '.agents/skills/linked/SKILL.md ->', 'docs/SKILL.md']),
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
  });
  assert.equal(scanned.stdout, ONLY_A);
  assert.equal(scanned.stderr, 'warning: docs/SKILL.md: not in a skill root; ignored');
});

test('GitHub, a tree too large for one answer: no skill is lost, and one warning says what is not flagged', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md', 'docs/SKILL.md'], ['']),
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
  });
  assert.equal(scanned.stdout, ONLY_A);
  assert.equal(
    scanned.stderr,
    'warning: the tree is too large to list at once; a SKILL.md outside .agents/skills, .claude/skills, .github/skills, agent/skills is not flagged (GITHUB_TOKEN searches everywhere)',
  );
});

test('GitHub, a skill root too large for one answer: each skill directory is listed on its own, no skill is lost', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md', '.claude/skills/a/references/big.md', '.claude/skills/INDEX.md'], ['', '.claude/skills']),
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
  });
  assert.equal(scanned.stdout, ONLY_A);
});

test('listed but not readable at the scanned commit → a warning, skipped', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/gone/SKILL.md']),
    [raw('.claude/skills/gone/SKILL.md')]: { status: 404, body: '404: Not Found' },
  });
  assert.equal(scanned.code, 0);
  assert.equal(scanned.stdout, 'JetBrains/edge · 0 skills');
  assert.equal(scanned.stderr, 'warning: .claude/skills/gone/SKILL.md: listed, but not found at the scanned commit; skipped');
});

test('the first root\'s file not readable → the skill is the first readable copy', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.agents/skills/a/SKILL.md', '.claude/skills/a/SKILL.md']),
    [raw('.agents/skills/a/SKILL.md')]: { status: 404, body: '404: Not Found' },
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
  });
  assert.equal(scanned.stdout, ONLY_A);
  assert.equal(scanned.stderr, 'warning: .agents/skills/a/SKILL.md: listed, but not found at the scanned commit; skipped');
});

test('a copy that GitHub fails to answer → a warning, the scan goes on', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md', 'agent/skills/a/SKILL.md']),
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
    [raw('agent/skills/a/SKILL.md')]: { status: 502, body: 'Bad Gateway' },
  });
  assert.equal(scanned.code, 0);
  assert.equal(scanned.stdout, ONLY_A);
  assert.equal(scanned.stderr, `warning: agent/skills/a/SKILL.md: GitHub answered 502 for ${raw('agent/skills/a/SKILL.md')}; skipped`);
});

test('no file of a skill that GitHub answers → the error, exit code 1', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md']),
    [raw('.claude/skills/a/SKILL.md')]: { status: 502, body: 'Bad Gateway' },
  });
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stderr, `GitHub answered 502 for ${raw('.claude/skills/a/SKILL.md')}`);
});

test('a copy with malformed front matter → its warning, but no other name to compare', async (t) => {
  const directory = temporary(t, {
    '.claude/skills/commits/SKILL.md': '---\nname: commit-messages\ndescription: Commit messages.\n---\n',
    'agent/skills/commits/SKILL.md': '---\nname: [unclosed\n---\n',
  });
  const scanned = await atlas(['scan', directory]);
  assert.match(scanned.stdout, /^commit-messages — Commit messages\.$/m);
  assert.match(scanned.stderr, /^warning: agent\/skills\/commits\/SKILL\.md: malformed front matter: /);
  assert.doesNotMatch(scanned.stderr, /a copy of/);
});

test('GitHub: the date is the last commit that touched the SKILL.md, up to the scanned commit', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md']),
    ...lastCommits('JetBrains/edge', COMMIT, { '.claude/skills/a/SKILL.md': '2026-03-14T18:02:11Z' }),
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^a — Skill a\.\n  updated 2026-03-14\n/m);
  assert.equal(scanned.stderr, '');
});

test('GitHub: no commit for the path → no date, and nothing else changes', async () => {
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, ['.claude/skills/a/SKILL.md']),
    ...lastCommits('JetBrains/edge', COMMIT, { '.claude/skills/a/SKILL.md': '' }),
    ...file('.claude/skills/a/SKILL.md', SKILL_A),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ONLY_A.split('\n').filter((line) => !line.startsWith('  updated ')).join('\n'));
  assert.equal(scanned.stderr, '');
});

test('GitHub: a date GitHub fails to answer → a warning, the skill is still listed', async () => {
  const path = '.claude/skills/a/SKILL.md';
  const commits = `${API}/repos/JetBrains/edge/commits?sha=${COMMIT}&path=${path}&per_page=1`;
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, [path]),
    ...file(path, SKILL_A),
    [commits]: { status: 502, body: { message: 'Bad Gateway' } },
  });
  assert.equal(scanned.code, 0);
  assert.equal(scanned.stdout, ONLY_A.split('\n').filter((line) => !line.startsWith('  updated ')).join('\n'));
  assert.equal(scanned.stderr, `warning: ${path}: GitHub answered 502 for ${commits}: Bad Gateway; no date`);
});

test("GitHub: the hour's requests spent on a date → the scan ends, as for a file", async () => {
  const path = '.claude/skills/a/SKILL.md';
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, [path]),
    ...file(path, SKILL_A),
    [`${API}/repos/JetBrains/edge/commits?sha=${COMMIT}&path=${path}&per_page=1`]: {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1.' },
      headers: { 'x-ratelimit-remaining': '0' },
    },
  });
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(scanned.stderr, 'GitHub rate limit reached; set GITHUB_TOKEN');
});

test('a skill in several roots → the newest of its copies', async () => {
  const paths = ['.claude/skills/a/SKILL.md', 'agent/skills/a/SKILL.md'];
  const scanned = await scanGitHub({
    ...repository(),
    ...trees('JetBrains/edge', COMMIT, paths),
    // The copy is the newer file: the skill is as fresh as its freshest folder.
    ...lastCommits('JetBrains/edge', COMMIT, { [paths[0]]: '2026-01-05T10:00:00Z', [paths[1]]: '2026-04-30T07:45:00Z' }),
    ...file(paths[0], SKILL_A),
    ...file(paths[1], SKILL_A),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^  updated 2026-04-30$/m);
  assert.doesNotMatch(scanned.stdout, /2026-01-05/);
});

test('a local git checkout: the date of the last commit that touched the SKILL.md', async (t) => {
  const directory = temporary(t, {
    '.claude/skills/a/SKILL.md': '---\nname: a\ndescription: Skill a.\n---\n',
    '.claude/skills/b/SKILL.md': '---\nname: b\ndescription: Skill b.\n---\n',
  });
  // The committer's date is the one the scan reads, so a commit made here is given the day it checks.
  const git = (args: string[], date?: string) => {
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
    const result = spawnSync('git', ['-C', directory, ...args], {
      encoding: 'utf8',
      env: date ? { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : env,
    });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'Both skills'], '2026-03-14T12:00:00Z');
  // Only b is touched again: a keeps the first commit's day, b takes the second's.
  writeFileSync(join(directory, '.claude/skills/b/SKILL.md'), '---\nname: b\ndescription: Skill b, revised.\n---\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'Revise b'], '2026-07-02T08:30:00Z');

  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^a — Skill a\.\n  updated 2026-03-14\n/m);
  assert.match(scanned.stdout, /^b — Skill b, revised\.\n  updated 2026-07-02\n/m);
  assert.equal(scanned.stderr, '');
});

test('a local directory that is not a git checkout → no date, and no warning', async (t) => {
  const directory = temporary(t, { '.claude/skills/a/SKILL.md': '---\nname: a\ndescription: Skill a.\n---\n' });
  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['repo · 1 skill', 'a — Skill a.', `  ${pathToFileURL(directory).href}/.claude/skills/a/SKILL.md`].join('\n'));
  assert.equal(scanned.stderr, '');
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
      headers: { 'x-ratelimit-remaining': '0' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

const API = 'https://api.github.com';
const COMMIT = 'e1f0e1f0e1f0e1f0e1f0e1f0e1f0e1f0e1f0e1f0';

/** What GitHub answers about JetBrains/edge before its files are listed. */
function repository(): Recording {
  return {
    [`${API}/repos/JetBrains/edge`]: { status: 200, body: { full_name: 'JetBrains/edge', default_branch: 'main' } },
    [`${API}/repos/JetBrains/edge/commits/main`]: { status: 200, body: { sha: COMMIT } },
  };
}

const SKILL_A = '---\nname: a\ndescription: Skill a.\n---\n';
const ONLY_A = [
  'JetBrains/edge · 1 skill',
  'a — Skill a.',
  `  updated ${SKILL_DAY}`,
  `  https://github.com/JetBrains/edge/blob/${COMMIT}/.claude/skills/a/SKILL.md`,
].join('\n');

function raw(path: string): string {
  return `https://raw.githubusercontent.com/JetBrains/edge/${COMMIT}/${path}`;
}

function file(path: string, text: string): Recording {
  return { [raw(path)]: { status: 200, body: text } };
}

/** Code search, answering these paths on one page. */
function search(paths: string[]): Recording {
  return {
    [`${API}/search/code?q=filename:SKILL.md+repo:JetBrains/edge&per_page=100&page=1`]: {
      status: 200,
      body: { total_count: paths.length, items: paths.map((path) => ({ path })) },
    },
  };
}

/** `skill-atlas scan github.com/JetBrains/edge`, with GitHub answering from the recording. */
async function scanGitHub(recording: Recording, token?: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', 'github.com/JetBrains/edge'], {
    open: (input) => openGitHub(input, { fetch: replay(recording), token }),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

/** A directory named `repo` with these files, removed after the test. */
function temporary(t: TestContext, files: Record<string, string>): string {
  const parent = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, 'repo');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return directory;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
