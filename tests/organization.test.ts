// The decisions in spec/analysis.md under "An organization" and in spec/cli.md, checked on what the
// real command prints for organizations and user accounts answered from recordings.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { run } from '../src/commands.ts';
import { openOrganization, parseGitHubOrganization, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { CLI, trees } from './helpers.ts';

const API = 'https://api.github.com';

test('an organization URL has no repository part; a repository URL is still a repository', () => {
  for (const input of ['github.com/JetBrains', 'https://github.com/JetBrains', 'https://www.github.com/JetBrains/', ' github.com/JetBrains ']) {
    assert.deepEqual(parseGitHubOrganization(input), { organization: 'JetBrains' }, input);
    assert.equal(parseGitHubUrl(input), undefined, input);
  }
  for (const input of ['github.com/JetBrains/kotlin', 'https://github.com/JetBrains/kotlin.git']) {
    assert.equal(parseGitHubOrganization(input), undefined, input);
    assert.deepEqual(parseGitHubUrl(input), { owner: 'JetBrains', repo: 'kotlin' }, input);
  }
});

test('an organization: its repositories, then every repository that has skills, sorted by name', async () => {
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['kotlin', 'MPS', 'website', 'empty']),
    ...repository('JetBrains/kotlin', ['.claude/skills/a/SKILL.md', '.claude/skills/b/SKILL.md']),
    ...repository('JetBrains/MPS', ['.agents/skills/a/SKILL.md']),
    ...repository('JetBrains/website', ['README.md']),
    ...repository('JetBrains/empty', []),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains · 4 repositories, 2 with skills', 'MPS · 1 skill', 'kotlin · 2 skills'].join('\n'));
  assert.equal(scanned.stderr, '');
});

test('a user account is listed the same way, from its own repositories', async () => {
  const scanned = await atlas(
    {
      ...account('octocat', 'User', ['hello-world']),
      ...repository('octocat/hello-world', ['agent/skills/a/SKILL.md']),
    },
    { input: 'github.com/octocat' },
  );
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['octocat · 1 repository, 1 with skills', 'hello-world · 1 skill'].join('\n'));
});

test('the account is named as GitHub spells it, whatever the URL said', async () => {
  const scanned = await atlas(
    {
      [`${API}/users/jetbrains`]: { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
      [`${API}/orgs/JetBrains/repos?per_page=100&page=1`]: { status: 200, body: [] },
    },
    { input: 'github.com/jetbrains' },
  );
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, 'JetBrains · 0 repositories, 0 with skills');
});

test('every page of repositories is listed: a skill on the second page is counted', async () => {
  const names = Array.from({ length: 150 }, (_, i) => `repo-${String(i).padStart(3, '0')}`);
  const recording: Recording = { ...account('Big', 'Organization', names) };
  for (const name of names) Object.assign(recording, repository(`Big/${name}`, name === 'repo-120' ? ['.claude/skills/a/SKILL.md'] : []));
  const scanned = await atlas(recording, { input: 'github.com/Big' });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['Big · 150 repositories, 1 with skills', 'repo-120 · 1 skill'].join('\n'));
});

test('the count follows the scan\'s rules: copies are one skill, links and other files are not skills', async () => {
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['mirror']),
    ...repository('JetBrains/mirror', [
      '.agents/skills/a/SKILL.md',
      '.claude/skills/a/SKILL.md', // the same directory in another root: a copy, not a second skill
      '.claude/skills/linked/SKILL.md ->', // a symbolic link is skipped
      '.claude/skills/SKILL.md', // not one directory deep
      '.claude/skills/a/references/SKILL.md', // too deep
      '.claude/skills/INDEX.md',
      '.claude/skills/b/skill.md', // not named exactly SKILL.md
    ]),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains · 1 repository, 1 with skills', 'mirror · 1 skill'].join('\n'));
  // Nothing is read, so a copy's name is never compared; only the skill roots are listed, so no path is flagged.
  assert.equal(scanned.stderr, '');
});

test('no SKILL.md is read: a skill the files cannot answer for is still counted', async () => {
  // The recording holds no raw.githubusercontent.com answer at all: a read would fail the scan.
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['unread']),
    ...repository('JetBrains/unread', ['.claude/skills/a/SKILL.md']),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains · 1 repository, 1 with skills', 'unread · 1 skill'].join('\n'));
});

test('a skill root too large for one answer: each skill directory is listed on its own, no skill is lost', async () => {
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['large']),
    ...repository('JetBrains/large', ['.claude/skills/a/SKILL.md', '.claude/skills/a/references/big.md', '.claude/skills/b/SKILL.md'], ['', '.claude/skills']),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains · 1 repository, 1 with skills', 'large · 2 skills'].join('\n'));
});

test('no repository has skills → 0 with skills, exit code 0', async () => {
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['one', 'two']),
    ...repository('JetBrains/one', ['README.md']),
    ...repository('JetBrains/two', []),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, 'JetBrains · 2 repositories, 0 with skills');
});

test('a repository GitHub fails to answer → a warning, and the others are still counted', async () => {
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['blank', 'kotlin']),
    // An empty repository has no commit on its default branch.
    [`${API}/repos/JetBrains/blank/commits/main`]: { status: 409, body: { message: 'Git Repository is empty.' } },
    ...repository('JetBrains/kotlin', ['.claude/skills/a/SKILL.md']),
  });
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout, ['JetBrains · 2 repositories, 1 with skills', 'kotlin · 1 skill'].join('\n'));
  assert.equal(
    scanned.stderr,
    `warning: JetBrains/blank: GitHub answered 409 for ${API}/repos/JetBrains/blank/commits/main: Git Repository is empty.; skipped`,
  );
});

test('a rate limit ends the scan: a message, exit code 1', async () => {
  const scanned = await atlas({
    ...account('JetBrains', 'Organization', ['kotlin']),
    [`${API}/repos/JetBrains/kotlin/commits/main`]: { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  });
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(scanned.stderr, 'GitHub rate limit reached; try again in a minute');
});

test('an organization or user that does not exist → a clear message, exit code 1', async () => {
  const scanned = await atlas({ [`${API}/users/no-such-org`]: { status: 404, body: { message: 'Not Found' } } }, { input: 'github.com/no-such-org' });
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stderr, 'Organization or user not found: https://github.com/no-such-org');
});

test('without GITHUB_TOKEN → a message that asks for it, exit code 1, and nothing is requested', async () => {
  const scanned = await atlas({ ...account('JetBrains', 'Organization', ['kotlin']) }, { token: '' });
  assert.equal(scanned.code, 1);
  assert.equal(scanned.stdout, '');
  assert.equal(
    scanned.stderr,
    'Scanning an organization needs GITHUB_TOKEN: without it GitHub allows 60 requests an hour, too few for its repositories',
  );

  // The real CLI, with no token in its environment: the same message, before any request.
  const cli = spawnSync(process.execPath, [CLI, 'scan', 'https://github.com/JetBrains'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_TOKEN: '' },
  });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.match(cli.stderr, /^Scanning an organization needs GITHUB_TOKEN: /);
});

test('help names the organization scan', () => {
  const help = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^  scan github\.com\/<organization>  /m);
});

/** What GitHub answers about an account and its repositories, 100 to a page, as the CLI asks. */
function account(login: string, type: 'Organization' | 'User', names: string[]): Recording {
  const listing = type === 'Organization' ? `${API}/orgs/${login}/repos` : `${API}/users/${login}/repos`;
  const recording: Recording = { [`${API}/users/${login}`]: { status: 200, body: { login, type } } };
  for (let page = 1; ; page++) {
    const items = names.slice((page - 1) * 100, page * 100);
    recording[`${listing}?per_page=100&page=${page}`] = {
      status: 200,
      body: items.map((name) => ({ full_name: `${login}/${name}`, default_branch: 'main' })),
    };
    if (items.length < 100) break;
  }
  return recording;
}

/** What GitHub answers for one repository of the account: its commit and its trees. */
function repository(id: string, paths: string[], truncated: string[] = []): Recording {
  const sha = `sha-${id.replaceAll('/', '-')}`;
  return { [`${API}/repos/${id}/commits/main`]: { status: 200, body: { sha } }, ...trees(id, sha, paths, truncated) };
}

/** `skill-atlas scan github.com/<organization>`, with GitHub answering from the recording. */
async function atlas(recording: Recording, options: { input?: string; token?: string } = {}) {
  // An empty token is no token, as the CLI reads GITHUB_TOKEN.
  const { input = 'github.com/JetBrains', token = 'test' } = options;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const fetch = replay(recording);
  const code = await run(['scan', input], {
    open: () => Promise.reject(new Error(`a repository was opened for ${input}`)),
    openOrganization: (organization) => openOrganization(organization, { fetch, token: token || undefined }),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
