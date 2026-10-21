// The decisions in spec/analysis.md under "Groups", checked on what the real command prints for
// directories the tests make: one small repository per rule, so a group is read the way a user
// reads it — the word above the skills it covers.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { atlas, temporary } from './helpers.ts';

/** A repository of these skills, each `name: description`, as a directory named after the name. */
function skills(t: TestContext, named: Record<string, string>): string {
  const files: Record<string, string> = {};
  let index = 0;
  for (const [name, description] of Object.entries(named)) {
    // The directory is not the name: nothing here may depend on a directory's own words.
    files[`.claude/skills/skill-${index++}/SKILL.md`] = `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;
  }
  return temporary(t, files);
}

/** The groups the scan printed: each word, and the names under it, in the order they came. */
async function groups(t: TestContext, named: Record<string, string>): Promise<[string, string[]][]> {
  const scanned = await atlas(['scan', skills(t, named)]);
  assert.equal(scanned.code, 0, scanned.stderr);
  const found: [string, string[]][] = [];
  for (const line of scanned.stdout.split('\n')) {
    const heading = /^(\S+) · \d+ skills?$/.exec(line);
    // The repository's own line is a heading too, by shape; the groups come after it.
    if (heading && !heading[1].includes('/') && heading[1] !== 'repo') found.push([heading[1], []]);
    else if (/^\S/.test(line) && found.length > 0) found.at(-1)?.[1].push(line.split(' — ')[0]);
  }
  return found;
}

test("a group's word comes from a skill's name, never from a description alone", async (t) => {
  // Both descriptions say `widget`, and no name does: there is no group to call `widget`.
  const printed = await groups(t, {
    'alpha-one': 'Tend the widget pipeline.',
    'beta-two': 'Also tend the widget pipeline.',
  });
  assert.deepEqual(printed, []);
});

test('a skill joins a group on its description: the word is anywhere in its name or description', async (t) => {
  const printed = await groups(t, {
    'issue-create': 'Open an issue.',
    'issue-triage': 'Sort the new ones.',
    'pr-flow': 'Take an issue through to a merged change.',
    'local-dev': 'Run it here.',
  });
  // `pr-flow` never says `issue` in its name; its description does.
  assert.deepEqual(printed, [
    ['issue', ['issue-create', 'issue-triage', 'pr-flow']],
    ['other', ['local-dev']],
  ]);
});

test('the strongest word goes first: the most names, then the most names and descriptions', async (t) => {
  const printed = await groups(t, {
    'api-get': 'Get one record.',
    'api-list': 'List the records.',
    'docs-build': 'Build the docs of the api.',
    'docs-serve': 'Serve what was built.',
  });
  // `api` and `docs` are each in two names; `api` is in three names and descriptions, `docs` in two.
  assert.deepEqual(printed, [
    ['api', ['api-get', 'api-list', 'docs-build']],
    ['other', ['docs-serve']],
  ]);
});

test('a tie on both counts is settled alphabetically', async (t) => {
  const printed = await groups(t, { 'alpha-beta': 'One of them.', 'alpha-beta-too': 'The other one.', 'zulu-solo': 'Shares nothing.' });
  // `alpha` and `beta` are both in two names and in two names and descriptions; `alpha` comes first.
  assert.deepEqual(printed, [
    ['alpha', ['alpha-beta', 'alpha-beta-too']],
    ['other', ['zulu-solo']],
  ]);
});

test('a word one skill alone uses is no group: nothing shared, and no word above anything', async (t) => {
  const printed = await groups(t, { 'alpha-one': 'Does one thing.', 'beta-two': 'Does another.' });
  assert.deepEqual(printed, []);
});

test('two characters are enough: `pr` and `v2` group, a bare number does not', async (t) => {
  // A third skill that shares nothing, so there is a division to see at all.
  const alone = { 'zulu-solo': 'Shares nothing.' };
  assert.deepEqual(await groups(t, { 'pr-flow': 'Open one.', 'pr-review': 'Review one.', ...alone }), [
    ['pr', ['pr-flow', 'pr-review']],
    ['other', ['zulu-solo']],
  ]);
  assert.deepEqual(await groups(t, { 'v2-release': 'Cut it.', 'v2-smoke': 'Smoke it.', ...alone }), [
    ['v2', ['v2-release', 'v2-smoke']],
    ['other', ['zulu-solo']],
  ]);
  // `2026` is all they share, and a number says nothing about what a skill is for.
  assert.deepEqual(await groups(t, { 'release-2026': 'Cut it.', 'hotfix-2026': 'Patch it.', ...alone }), []);
});

test("the repository's own name never groups anything", async (t) => {
  // The directory the scan reads is named `repo`, so `repo` is this repository's own name.
  const printed = await groups(t, {
    'repo-get': 'Get one record.',
    'repo-list': 'List the records.',
    'repo-api-call': 'Call the api.',
    'api-serve': 'Serve the api.',
  });
  // `repo` is in three names and groups nothing; `api` groups the two that share it.
  assert.deepEqual(printed, [
    ['api', ['api-serve', 'repo-api-call']],
    ['other', ['repo-get', 'repo-list']],
  ]);
});

test('a common word never groups anything', async (t) => {
  // `the` is in two names and three names and descriptions, and groups nothing; `plan` groups two.
  assert.deepEqual(await groups(t, { 'the-plan': 'Write it.', 'the-report': 'Read it.', 'use-it': 'Use the plan when you use it.' }), [
    ['plan', ['the-plan', 'use-it']],
    ['other', ['the-report']],
  ]);
});

test('no stemming: `commit` and `committing` are two words', async (t) => {
  assert.deepEqual(await groups(t, { 'commit-write': 'Write one.', 'committing-guide': 'Before committing.' }), []);
});

test('only the name and the description are read, never the SKILL.md body', async (t) => {
  const directory = temporary(t, {
    // The bodies share `deployment` over and over; the names and the descriptions share nothing.
    '.claude/skills/a/SKILL.md': '---\nname: alpha-one\ndescription: Does one thing.\n---\n# Deployment\nDeployment, deployment.\n',
    '.claude/skills/b/SKILL.md': '---\nname: beta-two\ndescription: Does another.\n---\n# Deployment\nDeployment, deployment.\n',
  });
  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.doesNotMatch(scanned.stdout, /^deployment · /m);
  assert.doesNotMatch(scanned.stdout, /^other · /m);
});

test('the wordless group is last, and is shown as `other`', async (t) => {
  const printed = await groups(t, {
    'zeta-alone': 'Shares nothing.',
    'api-get': 'Get one.',
    'api-list': 'List them.',
  });
  assert.deepEqual(printed, [
    ['api', ['api-get', 'api-list']],
    ['other', ['zeta-alone']],
  ]);
});

test('inside a group the skills keep the scan’s order, by name', async (t) => {
  const printed = await groups(t, { 'api-zulu': 'Last by name.', 'api-alpha': 'First by name.', 'api-mike': 'In between.', 'solo-thing': 'Shares nothing.' });
  assert.deepEqual(printed, [
    ['api', ['api-alpha', 'api-mike', 'api-zulu']],
    ['other', ['solo-thing']],
  ]);
});

test('one group is no division: the same word in every skill, and no word is printed', async (t) => {
  const directory = skills(t, { 'api-get': 'Get one.', 'api-list': 'List them.', 'api-delete': 'Remove one.' });
  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.code, 0, scanned.stderr);
  // Every skill is under `api`, which divides nothing: the list is printed as it was before groups.
  assert.doesNotMatch(scanned.stdout, /^api · /m);
  assert.equal(scanned.stdout.split('\n')[0], 'repo · 3 skills');
  assert.equal(scanned.stdout.split('\n')[1], 'api-delete — Remove one.');
  assert.doesNotMatch(scanned.stdout, /\n\n/);
});

test('one skill is one group: nothing to divide, and no word above it', async (t) => {
  const scanned = await atlas(['scan', skills(t, { 'api-get': 'Get one.' })]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stdout.split('\n')[0], 'repo · 1 skill');
  assert.equal(scanned.stdout.split('\n')[1], 'api-get — Get one.');
});

test('a skill with no description groups on its name alone', async (t) => {
  const directory = temporary(t, {
    '.claude/skills/a/SKILL.md': '---\nname: api-get\n---\n',
    '.claude/skills/b/SKILL.md': '---\nname: api-list\ndescription: List them.\n---\n',
    '.claude/skills/c/SKILL.md': '---\nname: other-thing\n---\n',
  });
  const scanned = await atlas(['scan', directory]);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^api · 2 skills$/m);
  assert.match(scanned.stdout, /^other · 1 skill$/m);
});

test('the groups are the scan’s: the same skills divide the same way, every run', async (t) => {
  const named = { 'api-get': 'Get one.', 'api-list': 'List them.', 'docs-build': 'Build the docs of the api.', 'zeta-alone': 'Shares nothing.' };
  const directory = skills(t, named);
  const first = await atlas(['scan', directory]);
  const again = await atlas(['scan', directory]);
  assert.equal(first.stdout, again.stdout);
});
