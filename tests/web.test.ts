// The decisions in spec/web.md, checked on the real `skill-atlas serve` for ./fixture, and on the
// web view over a small GitHub repository answered from a recording.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';
import { serve } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, trees } from './helpers.ts';
import { openPage } from './page.ts';

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

// The filter, driven on the page's own script against the really running server. ./fixture has six
// skills: code-style, commits, deploy, release-checklist and review twice.
const ALL = ['code-style', 'commits', 'deploy', 'release-checklist', 'review', 'review'];

test('the page: a filter above the skills list, shown once a scan has drawn one', async () => {
  const page = await openPage(address);
  assert.equal(page.filterShown(), false, 'nothing to filter before a scan');
  await page.scan(FIXTURE);
  assert.equal(page.filterShown(), true);
  assert.deepEqual(page.visible(), ALL);
  assert.equal(page.count(), '6 of 6');
});

// The DOM below models `hidden` as a property, with no stylesheet behind it, so it cannot see that
// `#search { display: flex }` overrides the browser's own `[hidden] { display: none }` — an author
// display rule wins over the user agent's. The rule that puts `hidden` back is checked on the CSS
// the server actually serves; without it the filter is on screen before there is a list to filter.
test('the filter is laid out without defeating its own hidden attribute', async () => {
  const page = await get('/');
  assert.match(page.body, /#search\[hidden\]\s*\{[^}]*display:\s*none/);
  const [, css] = /<style>([\s\S]*?)<\/style>/.exec(page.body) ?? [];
  assert.ok(css, 'the page has a stylesheet');
  // The override must come after the rule it overrides: the two have equal specificity.
  assert.ok(css.indexOf('#search[hidden]') > css.indexOf('#search {'), '#search[hidden] must follow #search');
});

test('typing filters the list to the skills whose name or description matches', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  // `commits` by its name and its description; `code-style` by "committing" in its description only.
  page.type('commit');
  assert.deepEqual(page.visible(), ['code-style', 'commits']);
  // Both `review` skills by "before it is merged" in their descriptions alone, nothing in a name.
  page.type('merged');
  assert.deepEqual(page.visible(), ['review', 'review']);
});

test('matching is substring-based, anywhere in the name or the description', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  // In the middle of `deploy`, so a match on the start of the name alone would miss it.
  page.type('epl');
  assert.deepEqual(page.visible(), ['deploy']);
  page.type('zzz');
  assert.deepEqual(page.visible(), []);
});

test('matching is case-insensitive', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  page.type('REVIEW');
  assert.deepEqual(page.visible(), ['review', 'review']);
  page.type('Kotlin');
  assert.deepEqual(page.visible(), ['code-style']);
});

test('the count is the matches against the whole list', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  page.type('review');
  assert.equal(page.count(), '2 of 6');
  page.type('Kotlin');
  assert.equal(page.count(), '1 of 6');
  page.type('zzz');
  assert.equal(page.count(), '0 of 6');
});

test('emptying the filter restores the whole list; a scan empties the filter', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  page.type('review');
  assert.deepEqual(page.visible(), ['review', 'review']);
  page.type('');
  assert.deepEqual(page.visible(), ALL);
  assert.equal(page.count(), '6 of 6');
  // A query says nothing about the skills of the next repository, so a scan starts from them all.
  page.type('review');
  await page.scan(FIXTURE);
  assert.equal(page.query(), '');
  assert.deepEqual(page.visible(), ALL);
  assert.equal(page.count(), '6 of 6');
});

test('the skill chosen on the right stays chosen while the query narrows the list', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  // The first skill is chosen after a scan; filtering it away does not choose another one.
  assert.equal(page.chosen(), 'code-style');
  page.type('review');
  assert.equal(page.chosen(), 'code-style');
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

test('a malformed request URL → 400, and the server stays up', async () => {
  const { hostname, port } = new URL(address);
  // A request target that URL parsing rejects, sent raw so fetch cannot normalise it.
  const status = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(Number(port), hostname, () => {
      socket.write('GET //[/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (data += chunk));
    socket.on('end', () => resolve(data.split('\r\n', 1)[0]));
    socket.on('error', reject);
  });
  assert.match(status, /^HTTP\/1\.1 400\b/);
  // The process did not crash: it still answers normal requests.
  assert.equal((await get('/')).status, 200);
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
