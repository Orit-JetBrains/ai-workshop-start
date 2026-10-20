// The decisions in spec/web.md, checked on the real `skill-atlas serve` for ./fixture, and on the
// web view over a small GitHub repository answered from a recording.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';
import { serve } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, trees } from './helpers.ts';

type Answer = {
  repository: { id: string };
  skills: { name: string; description: string; path: string; link: string; copies: string[]; text: string }[];
  warnings: string[];
  error?: string;
};

// `skill-atlas serve 0`, as a user runs it; stopped after the tests.
const cli = spawn(process.execPath, [CLI, 'serve', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const address = await new Promise<string>((resolve, reject) => {
  let out = '';
  cli.stdout.on('data', (chunk) => {
    out += chunk;
    const match = /^Skill Atlas: (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(out);
    if (match) resolve(match[1]);
  });
  cli.once('exit', (code) => reject(new Error(`serve exited with ${code}`)));
});
test.after(() => cli.kill());

async function get(path: string, base = address) {
  const response = await fetch(new URL(path, base));
  return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() };
}

async function scanned(repo: string, base = address): Promise<{ status: number; answer: Answer }> {
  const { status, body } = await get(`/api/scan?repo=${encodeURIComponent(repo)}`, base);
  return { status, answer: JSON.parse(body) };
}

test('serve prints its address, on 127.0.0.1', () => {
  assert.match(address, /^http:\/\/127\.0\.0\.1:\d+\/$/);
});

test('the page: a field for the repository and a Scan button', async () => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.type, /^text\/html/);
  assert.match(page.body, /<input id="repo" name="repo"[^>]*>/);
  assert.match(page.body, /<button>Scan<\/button>/);
  assert.match(page.body, /new URLSearchParams\(location\.search\)\.get\('repo'\)/);
});

test('a local directory: every project skill sorted as for scan, with its link, copies and SKILL.md', async () => {
  const { status, answer } = await scanned(FIXTURE);
  assert.equal(status, 200);
  assert.equal(answer.repository.id, 'fixture');
  assert.deepEqual(
    answer.skills.map((skill) => [skill.name, skill.path]),
    [
      ['code-style', '.github/skills/code-style/SKILL.md'],
      ['commits', '.claude/skills/commits/SKILL.md'],
      ['deploy', '.claude/skills/deploy/SKILL.md'],
      ['release-checklist', '.agents/skills/release-checklist/SKILL.md'],
      ['review', '.claude/skills/review-a/SKILL.md'],
      ['review', '.claude/skills/review-b/SKILL.md'],
    ],
  );
  const commits = answer.skills[1];
  assert.equal(commits.link, `${pathToFileURL(FIXTURE).href}/.claude/skills/commits/SKILL.md`);
  assert.deepEqual(commits.copies, ['agent/skills/commits/SKILL.md']);
  for (const skill of answer.skills) assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'));
});

test('the warnings come with the skills', async () => {
  const { answer } = await scanned(FIXTURE);
  assert.ok(answer.warnings.includes('docs/SKILL.md: not in a skill root; ignored'));
  assert.ok(answer.warnings.some((warning) => warning.startsWith('.agents/skills/release-checklist/SKILL.md: malformed front matter: ')));
});

test('unreachable repository, or no repository → its message, status 400', async () => {
  const missing = await scanned(join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.equal(missing.answer.error, `Not a GitHub URL or a readable directory: ${join(FIXTURE, 'no-such-directory')}`);
  const empty = await get('/api/scan');
  assert.equal(empty.status, 400);
  assert.equal(JSON.parse(empty.body).error, 'Enter a GitHub URL or a directory');
});

test('any other path → 404', async () => {
  assert.equal((await get('/nope')).status, 404);
});

test('nothing is stored: each scan reads the repository again', async () => {
  let opened = 0;
  const { url, server } = await serve(0, (input) => (opened++, openDirectory(input)));
  try {
    await scanned(FIXTURE, url);
    await scanned(FIXTURE, url);
    assert.equal(opened, 2);
  } finally {
    server.close();
  }
});

test('a GitHub repository: the skill with its pinned link and SKILL.md', async () => {
  const text = '---\nname: commits\ndescription: Write commit messages.\n---\n# Commits\n';
  const fetch = replay({
    'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
    'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
    ...trees('JetBrains/example', EXAMPLE_COMMIT, ['.claude/skills/commits/SKILL.md']),
    [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: { status: 200, body: text },
  });
  const { url, server } = await serve(0, (input) => openGitHub(input, { fetch }));
  try {
    const { status, answer } = await scanned('https://github.com/JetBrains/example', url);
    assert.equal(status, 200);
    assert.equal(answer.repository.id, 'JetBrains/example');
    assert.deepEqual(answer.skills.map(({ name, description, link, text }) => ({ name, description, link, text })), [
      {
        name: 'commits',
        description: 'Write commit messages.',
        link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
        text,
      },
    ]);
  } finally {
    server.close();
  }
});

test('a port in use → a clear message, exit code 1', () => {
  const port = new URL(address).port;
  const busy = spawnSync(process.execPath, [CLI, 'serve', port], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(busy.status, 1);
  assert.equal(busy.stderr.trim(), `Port ${port} is in use; try serve <port>`);
});

test('serve with a port that is not a number → usage, exit code 1', () => {
  const wrong = spawnSync(process.execPath, [CLI, 'serve', 'abc'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(wrong.status, 1);
  assert.equal(wrong.stderr.trim(), 'Usage: skill-atlas serve [port]');
});
