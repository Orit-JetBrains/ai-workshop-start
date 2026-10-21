// The decisions in spec/web.md, checked on the real `skill-atlas serve` for ./fixture, and on the
// web view over a small GitHub repository answered from a recording.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub, openOrganization } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';
import { serve } from '../src/web.ts';
import { CLI, EXAMPLE_COMMIT, FIXTURE, SKILL_DAY, trees } from './helpers.ts';
import { openPage } from './page.ts';

type Answer = {
  repository: { id: string };
  skills: { name: string; description: string; path: string; link: string; updatedAt: string; copies: string[]; text: string; group: string }[];
  groups: { word: string; skills: number }[];
  warnings: string[];
  error?: string;
};

// `skill-atlas serve 0`, as a user runs it; stopped after the tests. Without GITHUB_TOKEN, so an
// organization in the field is answered before any request leaves for GitHub.
const cli = spawn(process.execPath, [CLI, 'serve', '0'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GITHUB_TOKEN: '' } });
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

// A second server, for `cluster=1`: the same `serve`, with a stand-in for `claude -p` that answers
// with groups of its own. Nothing here reaches a model, a login or the network.
const clusterDirectory = mkdtempSync(join(tmpdir(), 'skill-atlas-cluster-'));
test.after(() => rmSync(clusterDirectory, { recursive: true, force: true }));
const STAND_IN_GROUPS = { groups: [{ label: 'reviewing', skills: [5, 6, 1] }, { label: 'shipping', skills: [3, 4] }] };
writeFileSync(
  join(clusterDirectory, 'claude.mjs'),
  `process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: ${JSON.stringify(JSON.stringify(STAND_IN_GROUPS))} }));`,
);
writeFileSync(join(clusterDirectory, 'claude'), `#!/bin/sh\nexec ${process.execPath} ${join(clusterDirectory, 'claude.mjs')} \"$@\"\n`, { mode: 0o755 });
const clusterCli = spawn(process.execPath, [CLI, 'serve', '0'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GITHUB_TOKEN: '', SKILL_ATLAS_CLAUDE: join(clusterDirectory, 'claude') },
});
const clusterAddress = await new Promise<string>((resolve, reject) => {
  let out = '';
  clusterCli.stdout.on('data', (chunk) => {
    out += chunk;
    const match = /^Skill Atlas: (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(out);
    if (match) resolve(match[1]);
  });
  clusterCli.once('exit', (code) => reject(new Error(`serve exited with ${code}`)));
});
test.after(() => clusterCli.kill());

async function get(path: string, base = address) {
  const response = await fetch(new URL(path, base));
  return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() };
}

async function scanned(repo: string, base = address, extra = ''): Promise<{ status: number; answer: Answer }> {
  const { status, body } = await get(`/api/scan?repo=${encodeURIComponent(repo)}${extra}`, base);
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
/**
 * Every skill of ./fixture, in the order the list shows them: by group — `review`, the word the two
 * review skills share, then the four that share none — and by name inside it, as the scan sorts them.
 */
const ALL = ['review', 'review', 'code-style', 'commits', 'deploy', 'release-checklist'];

// Layout is checked on the HTML and CSS the server serves: the DOM below has no stylesheet.
test('the top bar: the scan field on the left, the filter on the right, outside the list that scrolls', async () => {
  const { body } = await get('/');
  const header = /<header>([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
  // In the header, the scan form first, then the filter: left, then right.
  assert.ok(header.includes('<form id="scan">'), 'the scan form is in the top bar');
  assert.ok(header.includes('<input id="filter"'), 'the filter is in the top bar');
  assert.ok(header.indexOf('<form id="scan">') < header.indexOf('<div id="search">'), 'the scan field comes first');
  // Not inside <main>, whose panels scroll: the filter stays on screen while the list scrolls.
  const main = /<main>([\s\S]*?)<\/main>/.exec(body)?.[1] ?? '';
  assert.doesNotMatch(main, /id="(filter|search|repo)"/);
  const [, css] = /<style>([\s\S]*?)<\/style>/.exec(body) ?? [];
  assert.match(css ?? '', /header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*2fr 1fr/);
  assert.match(css ?? '', /#list, #file\s*\{[^}]*overflow:\s*auto/);
});

test('the filter is always shown: before a scan, after one, and after an error', async () => {
  const { body } = await get('/');
  assert.doesNotMatch(body, /<div id="search"[^>]*\shidden/);
  const page = await openPage(address);
  assert.equal(page.filterShown(), true, 'shown before a scan');
  // Nothing to count yet, and typing does no harm.
  assert.equal(page.count(), '');
  page.type('review');
  assert.equal(page.count(), '');
  await page.scan(FIXTURE);
  assert.equal(page.filterShown(), true);
  assert.deepEqual(page.visible(), ALL);
  assert.equal(page.count(), '6 of 6');
  // An error leaves no list to count, but the filter stays.
  await page.scan(join(FIXTURE, 'no-such-directory'));
  assert.equal(page.filterShown(), true);
  assert.equal(page.count(), '');
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
  // The first skill of the list is chosen after a scan; filtering it away does not choose another one.
  assert.equal(page.chosen(), 'review');
  page.type('Kotlin');
  assert.deepEqual(page.visible(), ['code-style']);
  assert.equal(page.chosen(), 'review');
});

// The groups of spec/web.md: the words above the skills, and what the filter does to them.
test('the skills are shown in groups, the word and the count above each one', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  // ./fixture divides in two: `review`, the word its two review skills share, then the rest.
  assert.deepEqual(page.groups(), ['review · 2 skills', 'other · 4 skills']);
  assert.deepEqual(page.visible(), ALL);
});

test('a group the filter empties is hidden with its skills: never a word with nothing under it', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  page.type('Kotlin');
  // Only code-style matches, and it is in the wordless group: `review` goes with its skills.
  assert.deepEqual(page.visible(), ['code-style']);
  assert.deepEqual(page.groups(), ['other · 4 skills']);
  // The count is the matches against the whole list, not against a group.
  assert.equal(page.count(), '1 of 6');
  page.type('zzz');
  assert.deepEqual(page.groups(), []);
  // Emptying the filter brings every group back.
  page.type('');
  assert.deepEqual(page.groups(), ['review · 2 skills', 'other · 4 skills']);
});

test('one group is no division: a repository whose skills share one word shows no word at all', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, description] of [
    ['api-get', 'Get one record.'],
    ['api-list', 'List the records.'],
  ]) {
    mkdirSync(join(directory, `.claude/skills/${name}`), { recursive: true });
    writeFileSync(join(directory, `.claude/skills/${name}/SKILL.md`), `---\nname: ${name}\ndescription: ${description}\n---\n`);
  }
  const { answer } = await scanned(directory);
  assert.deepEqual(answer.groups, [{ word: 'api', skills: 2 }]);
  const page = await openPage(address);
  await page.scan(directory);
  assert.deepEqual(page.groups(), []);
  assert.deepEqual(page.visible(), ['api-get', 'api-list']);
});

test('the API answers each skill its group, and the groups in the order the page draws them', async () => {
  const { answer } = await scanned(FIXTURE);
  assert.deepEqual(answer.groups, [
    { word: 'review', skills: 2 },
    { word: '', skills: 4 },
  ]);
  assert.deepEqual(
    answer.skills.map((skill) => [skill.name, skill.group]),
    [
      ['code-style', ''],
      ['commits', ''],
      ['deploy', ''],
      ['release-checklist', ''],
      ['review', 'review'],
      ['review', 'review'],
    ],
  );
});

// `cluster=1`: the groups come from `claude -p` instead of from the words the skills share.
test('cluster=1: the API answers the model’s groups', async () => {
  const { status, answer } = await scanned(FIXTURE, clusterAddress, '&cluster=1');
  assert.equal(status, 200);
  // The stand-in's own groups, the skills under them in the scan's order, the rest wordless and last.
  assert.deepEqual(answer.groups, [
    { word: 'reviewing', skills: 3 },
    { word: 'shipping', skills: 2 },
    { word: '', skills: 1 },
  ]);
  assert.deepEqual(
    answer.skills.map((skill) => [skill.name, skill.group]),
    [
      ['code-style', 'reviewing'],
      ['commits', ''],
      ['deploy', 'shipping'],
      ['release-checklist', 'shipping'],
      ['review', 'reviewing'],
      ['review', 'reviewing'],
    ],
  );
  // The fixture's own warnings are there, as for any scan; the clustering added none of its own.
  assert.doesNotMatch(answer.warnings.join('\n'), /grouped by shared words instead/);
});

test('without cluster=1 the same server groups by the words the skills share', async () => {
  const { answer } = await scanned(FIXTURE, clusterAddress);
  assert.deepEqual(answer.groups, [
    { word: 'review', skills: 2 },
    { word: '', skills: 4 },
  ]);
});

test('cluster=1 in the page’s address: every scan it makes is clustered', async () => {
  const page = await openPage(clusterAddress, '?repo=' + encodeURIComponent(FIXTURE) + '&cluster=1');
  await page.scan(FIXTURE);
  assert.deepEqual(page.groups(), ['reviewing · 3 skills', 'shipping · 2 skills', 'other · 1 skill']);
  // The page without it, on the same server, is the shared words' again.
  const plain = await openPage(clusterAddress);
  await plain.scan(FIXTURE);
  assert.deepEqual(plain.groups(), ['review · 2 skills', 'other · 4 skills']);
});

test('a model that cannot be asked → the shared words’ groups, and the warning in the page', async () => {
  const { answer } = await scanned(FIXTURE, address, '&cluster=1');
  // This server has no stand-in: `claude` is not on its PATH, which is a warning, not an error.
  assert.deepEqual(answer.groups, [
    { word: 'review', skills: 2 },
    { word: '', skills: 4 },
  ]);
  assert.match(answer.warnings.join('\n'), /claude: not found on the PATH; grouped by shared words instead/);
  const page = await openPage(address, '?cluster=1');
  await page.scan(FIXTURE);
  assert.match(page.element('results').text, /grouped by shared words instead/);
  assert.deepEqual(page.groups(), ['review · 2 skills', 'other · 4 skills']);
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

test('the API answers each skill its updatedAt, an ISO-8601 date', async () => {
  // ./fixture is in this checkout's git history, so every skill of it has a date.
  const { answer } = await scanned(FIXTURE);
  for (const skill of answer.skills) assert.match(skill.updatedAt, /^\d{4}-\d{2}-\d{2}$/, `${skill.name}: ${skill.updatedAt}`);
});

test('the page shows the date beside each skill, and with the chosen one', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  const dates = page.element('results').querySelectorAll('li.skill').map((item) => item.querySelector('div.updated')?.text);
  assert.equal(dates.length, 6);
  for (const date of dates) assert.match(date ?? '', /^updated \d{4}-\d{2}-\d{2}$/);
  // The chosen skill — the first of the list, which is the first group's first: its path, its date
  // and its SKILL.md.
  assert.equal(page.element('file').querySelector('div.updated')?.text, dates[0]);
  assert.equal(page.element('file').querySelector('h1')?.text, '.claude/skills/review-a/SKILL.md');
});

test('a repository with no git history: no date in the answer, and none on the page', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, '.claude/skills/a'), { recursive: true });
  writeFileSync(join(directory, '.claude/skills/a/SKILL.md'), '---\nname: a\ndescription: Skill a.\n---\n');
  const { answer } = await scanned(directory);
  assert.deepEqual(answer.skills.map((skill) => [skill.name, skill.updatedAt]), [['a', '']]);
  const page = await openPage(address);
  await page.scan(directory);
  assert.equal(page.element('results').querySelector('li.skill')?.querySelector('div.updated'), null);
  assert.equal(page.element('file').querySelector('div.updated'), null);
});

test('the filter does not match on the date', async () => {
  const page = await openPage(address);
  await page.scan(FIXTURE);
  // Every row shows "updated", and none of them is a name or a description.
  page.type('updated');
  assert.deepEqual(page.visible(), []);
  assert.equal(page.count(), '0 of 6');
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

test('an organization in the field, without GITHUB_TOKEN → a message that asks for it, status 400', async () => {
  // The real CLI's serve: the organization reaches the organization scan, which needs a token.
  const organization = await scanned('github.com/JetBrains');
  assert.equal(organization.status, 400);
  assert.equal(
    organization.answer.error,
    'Scanning an organization needs GITHUB_TOKEN: without it GitHub allows 60 requests an hour, too few for its repositories',
  );
});

test('an organization: its repository count, then each repository that has skills with its count, sorted by name', async () => {
  await withOrganization(async (url) => {
    const { status, answer } = await scanned('https://github.com/JetBrains', url);
    assert.equal(status, 200);
    assert.deepEqual(answer, {
      organization: 'JetBrains',
      repositories: 4,
      withSkills: [
        { id: 'JetBrains/MPS', name: 'MPS', skills: 1 },
        { id: 'JetBrains/kotlin', name: 'kotlin', skills: 2 },
      ],
      warnings: [`JetBrains/broken: Not found on GitHub: ${API}/repos/JetBrains/broken/commits/main; skipped`],
    });
  });
});

test('the page draws an organization: the heading, each repository with skills and its count, the warnings', async () => {
  await withOrganization(async (url) => {
    const page = await openPage(url);
    await page.scan('https://github.com/JetBrains');
    const results = page.element('results');
    assert.equal(results.querySelector('h1')?.text, 'JetBrains · 4 repositories, 2 with skills');
    assert.deepEqual(
      results.querySelectorAll('li.repository').map((item) => item.text),
      ['MPS1 skill', 'kotlin2 skills'],
    );
    assert.match(results.querySelector('ul.warnings')?.text ?? '', /^warning: JetBrains\/broken: /);
  });
});

test('the filter narrows an organization\'s repositories by name, case-insensitively, with its count', async () => {
  await withOrganization(async (url) => {
    const page = await openPage(url);
    await page.scan('https://github.com/JetBrains');
    const shown = () => page.element('results').querySelectorAll('li.repository').filter((item) => !item.hidden).map((item) => item.querySelector('div.name')?.text);
    assert.equal(page.filterShown(), true);
    assert.equal(page.element('filter').placeholder, 'Filter repositories');
    assert.equal(page.count(), '2 of 2');
    page.type('OTL');
    assert.deepEqual(shown(), ['kotlin']);
    assert.equal(page.count(), '1 of 2');
    // A count is not a name: "skill" is in every row's text, yet matches no repository.
    page.type('skill');
    assert.deepEqual(shown(), []);
    page.type('');
    assert.deepEqual(shown(), ['MPS', 'kotlin']);
    // Choosing a repository starts its skills from an empty filter, now over skills.
    page.type('kot');
    page.element('results').querySelectorAll('li.repository')[1].dispatch('click');
    await until(() => page.element('results').querySelector('h1')?.text === 'JetBrains/kotlin · 2 skills');
    assert.equal(page.query(), '');
    assert.equal(page.element('filter').placeholder, 'Filter skills');
    assert.equal(page.count(), '2 of 2');
  });
});

test('choosing a repository of the organization scans it: its URL in the field, its skills in the list', async () => {
  await withOrganization(async (url) => {
    const page = await openPage(url);
    await page.scan('https://github.com/JetBrains');
    const kotlin = page.element('results').querySelectorAll('li.repository')[1];
    kotlin.dispatch('click');
    assert.equal(page.element('repo').value, 'https://github.com/JetBrains/kotlin');
    await until(() => page.element('results').querySelector('h1')?.text === 'JetBrains/kotlin · 2 skills');
    assert.deepEqual(page.visible(), ['a', 'b']);
    assert.equal(page.chosen(), 'a');
    // The keyboard does the same as the mouse.
    await page.scan('https://github.com/JetBrains');
    page.element('results').querySelectorAll('li.repository')[0].dispatch('keydown', { key: 'Enter' });
    await until(() => page.element('results').querySelector('h1')?.text === 'JetBrains/MPS · 1 skill');
  });
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
    assert.deepEqual(answer.skills.map(({ name, description, link, updatedAt, text }) => ({ name, description, link, updatedAt, text })), [
      {
        name: 'commits',
        description: 'Write commit messages.',
        link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
        updatedAt: SKILL_DAY,
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

const API = 'https://api.github.com';

/**
 * What GitHub answers for JetBrains, an organization: kotlin with two skills, MPS with one, docs
 * with none, and broken, which GitHub fails to answer. kotlin and MPS answer a full scan too.
 */
function organization(): Recording {
  const sha = (name: string) => `sha-${name}`;
  const recording: Recording = {
    [`${API}/users/JetBrains`]: { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
    [`${API}/orgs/JetBrains/repos?per_page=100&page=1`]: {
      status: 200,
      body: ['kotlin', 'MPS', 'docs', 'broken'].map((name) => ({ full_name: `JetBrains/${name}`, default_branch: 'main' })),
    },
    [`${API}/repos/JetBrains/broken/commits/main`]: { status: 404, body: { message: 'Not Found' } },
  };
  const skills: Record<string, string[]> = { kotlin: ['a', 'b'], MPS: ['c'], docs: [] };
  for (const [name, names] of Object.entries(skills)) {
    const id = `JetBrains/${name}`;
    recording[`${API}/repos/${id}`] = { status: 200, body: { full_name: id, default_branch: 'main' } };
    recording[`${API}/repos/${id}/commits/main`] = { status: 200, body: { sha: sha(name) } };
    Object.assign(recording, trees(id, sha(name), names.length ? names.map((skill) => `.claude/skills/${skill}/SKILL.md`) : ['README.md']));
    for (const skill of names) {
      recording[`https://raw.githubusercontent.com/${id}/${sha(name)}/.claude/skills/${skill}/SKILL.md`] = {
        status: 200,
        body: `---\nname: ${skill}\ndescription: Skill ${skill}.\n---\n`,
      };
    }
  }
  return recording;
}

/** A web view over the organization above, with a token for it; stopped after `work`. */
async function withOrganization(work: (url: string) => Promise<void>) {
  const fetch = replay(organization());
  const { url, server } = await serve(
    0,
    (input) => openGitHub(input, { fetch }),
    (input) => openOrganization(input, { fetch, token: 'test' }),
  );
  try {
    await work(url);
  } finally {
    server.close();
  }
}

/** Waits for what a click starts but does not hand back: a scan the page runs on its own. */
async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(done(), 'the page did not get there');
}
