// The decisions in spec/analysis.md under "Clustering with a model", checked on the real `scan
// --cluster` with a stand-in for `claude -p`: a script that prints the envelope the CLI prints, so
// every rule here is checked without a model, a login or a network.
//
// What the stand-in is asked is kept too, so the prompt and the flags are checked as they are sent.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { run } from '../src/commands.ts';
import { MODEL } from '../src/core/cluster.ts';
import { openDirectory } from '../src/local.ts';
import { temporary } from './helpers.ts';

/** Six skills, enough to divide; `review` is the word the shared-word heuristic finds in them. */
const SKILLS: Record<string, string> = {
  'api-get': 'Get one record.',
  'api-list': 'List the records.',
  'deploy': 'Ship it to production.',
  'release-notes': 'Write the notes of a release.',
  'review': 'Review a change before it is merged.',
  'review-fast': 'Review a small change quickly.',
};

/** What the shared words make of those six skills, which is what every failure falls back to. */
const SHARED_WORDS: [string, string[]][] = [
  ['api', ['api-get', 'api-list']],
  ['review', ['review', 'review-fast']],
  ['other', ['deploy', 'release-notes']],
];

/** A repository of those skills, and a place for the stand-in to write what it was asked. */
function repository(t: TestContext, skills = SKILLS): string {
  const files: Record<string, string> = {};
  for (const [name, description] of Object.entries(skills)) {
    files[`.claude/skills/${name}/SKILL.md`] = `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`;
  }
  return temporary(t, files);
}

/**
 * A stand-in for `claude -p`: writes the arguments it was given to `asked.json` beside itself, then
 * prints `prints` — the CLI's envelope, or whatever the test wants instead — and exits with `code`.
 */
function claude(directory: string, prints: string, code = 0): string {
  const path = join(directory, 'claude.mjs');
  writeFileSync(
    path,
    [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync(${JSON.stringify(join(directory, 'asked.json'))}, JSON.stringify(process.argv.slice(2)));`,
      `process.stdout.write(${JSON.stringify(prints)});`,
      `process.exit(${code});`,
    ].join('\n'),
  );
  return path;
}

/** What the CLI prints when it answers: the envelope, with the model's text in `result`. */
function envelope(result: unknown, failed = false): string {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: failed, num_turns: 1, result: text });
}

/** `skill-atlas scan <directory> --cluster`, with the stand-in in place of `claude`. */
async function cluster(directory: string, command: string, extra: string[] = []) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', directory, '--cluster', ...extra], {
    open: (input) => openDirectory(input),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
    // The stand-in is a script, so node runs it: the command is the same shape as a CLI on the PATH.
    cluster: { command: process.execPath, run: (_command, args, options) => runStandIn(command, args, options) },
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n'), groups: groups(stdout.join('\n')) };
}

/** Runs the stand-in the way the real one is run, through the core's own child process. */
async function runStandIn(script: string, args: string[], { timeout }: { timeout: number }) {
  const { spawn } = await import('node:child_process');
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('close', (code) => (clearTimeout(timer), resolve({ code, stdout, stderr })));
  });
}

/** The groups the scan printed: each word, and the names under it. */
function groups(stdout: string): [string, string[]][] {
  const found: [string, string[]][] = [];
  for (const line of stdout.split('\n')) {
    const heading = /^(\S+) · \d+ skills?$/.exec(line);
    if (heading && heading[1] !== 'repo') found.push([heading[1], []]);
    else if (/^\S/.test(line) && found.length > 0) found.at(-1)?.[1].push(line.split(' — ')[0]);
  }
  return found;
}

/** What the stand-in was asked, as `claude -p` was given it. */
function asked(directory: string): string[] {
  return JSON.parse(readFileSync(join(directory, 'asked.json'), 'utf8')) as string[];
}

test('the groups are the model’s, and the skills under them keep the scan’s order', async (t) => {
  const directory = repository(t);
  // The model's own order inside a group, and its own order of groups: `reading` before `shipping`.
  const command = claude(directory, envelope({ groups: [{ label: 'reading', skills: [2, 1, 6] }, { label: 'shipping', skills: [3, 4] }] }));
  const scanned = await cluster(directory, command);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.deepEqual(scanned.groups, [
    ['reading', ['api-get', 'api-list', 'review-fast']],
    ['shipping', ['deploy', 'release-notes']],
    ['other', ['review']],
  ]);
  assert.equal(scanned.stderr, '');
});

test('claude -p is asked for JSON, from the small model, with no tool and no prompt to answer', async (t) => {
  const directory = repository(t);
  const command = claude(directory, envelope({ groups: [{ label: 'reading', skills: [1, 2] }] }));
  await cluster(directory, command);
  const args = asked(directory);
  assert.equal(args[0], '-p');
  for (const [flag, value] of [
    ['--output-format', 'json'],
    ['--model', MODEL],
    ['--permission-prompts', 'none'],
  ]) {
    assert.equal(args[args.indexOf(flag) + 1], value, flag);
  }
  assert.ok(args.includes('--system-prompt'), 'a system prompt');
  assert.equal(MODEL, 'claude-haiku-4-5');
});

test('the model is shown each skill by number, its name and its description, never the body', async (t) => {
  const directory = repository(t);
  const command = claude(directory, envelope({ groups: [{ label: 'reading', skills: [1, 2] }] }));
  await cluster(directory, command);
  const prompt = asked(directory)[1];
  assert.match(prompt, /^Here are the 6 agent skills of the repository repo\.$/m);
  assert.match(prompt, /^1\. api-get — Get one record\.$/m);
  assert.match(prompt, /^6\. review-fast — Review a small change quickly\.$/m);
  // The SKILL.md body is in no prompt: the names and the descriptions are all a grouping needs.
  assert.doesNotMatch(prompt, /# api-get/);
  assert.match(prompt, /\{"groups":\[\{"label":"<word>","skills":\[<numbers>\]\}\]\}/);
});

test('a long description is cut, so a repository of long ones is still one small prompt', async (t) => {
  const long = `Start. ${'word '.repeat(200)}End.`;
  const directory = repository(t, { 'api-get': long, 'api-list': long, 'deploy': long });
  const command = claude(directory, envelope({ groups: [{ label: 'reading', skills: [1, 2] }] }));
  await cluster(directory, command);
  const prompt = asked(directory)[1];
  assert.doesNotMatch(prompt, /End\./);
  assert.ok(prompt.length < 2000, `the prompt is ${prompt.length} characters`);
});

test('a JSON answer in a code fence is read anyway', async (t) => {
  const directory = repository(t);
  const fenced = '```json\n{"groups":[{"label":"reading","skills":[1,2]}]}\n```';
  const scanned = await cluster(directory, claude(directory, envelope(fenced)));
  assert.deepEqual(scanned.groups, [
    ['reading', ['api-get', 'api-list']],
    ['other', ['deploy', 'release-notes', 'review', 'review-fast']],
  ]);
});

test('a label that is not a word, or is too long, is dropped; the skills under it are left over', async (t) => {
  const directory = repository(t);
  const answer = {
    groups: [
      { label: 'Reading and writing records', skills: [1, 2] },
      { label: 'x'.repeat(25), skills: [3, 4] },
      { label: 'review', skills: [5, 6] },
    ],
  };
  const scanned = await cluster(directory, claude(directory, envelope(answer)));
  assert.deepEqual(scanned.groups, [
    ['review', ['review', 'review-fast']],
    ['other', ['api-get', 'api-list', 'deploy', 'release-notes']],
  ]);
});

test('a number that is not a skill’s, or that another group took, is dropped', async (t) => {
  const directory = repository(t);
  const answer = {
    groups: [
      // 0 and 7 are no skill of this repository, and 1 is in the next group too.
      { label: 'reading', skills: [0, 1, 2, 7, 1] },
      { label: 'shipping', skills: [1, 3, 4] },
    ],
  };
  const scanned = await cluster(directory, claude(directory, envelope(answer)));
  assert.deepEqual(scanned.groups, [
    ['reading', ['api-get', 'api-list']],
    ['shipping', ['deploy', 'release-notes']],
    ['other', ['review', 'review-fast']],
  ]);
});

test('a group of fewer than two is dropped, and what the model left out is `other`, last', async (t) => {
  const directory = repository(t);
  const answer = { groups: [{ label: 'reading', skills: [1, 2] }, { label: 'alone', skills: [3] }] };
  const scanned = await cluster(directory, claude(directory, envelope(answer)));
  assert.deepEqual(scanned.groups, [
    ['reading', ['api-get', 'api-list']],
    ['other', ['deploy', 'release-notes', 'review', 'review-fast']],
  ]);
});

test('two groups the model labels the same word are one group, merged in the first’s place', async (t) => {
  const directory = repository(t);
  // The model answers with `review` twice; a scan's groups are read by their word, so the two are
  // one, and the skills of both are under it once — in the scan's order, not the model's.
  const answer = {
    groups: [
      { label: 'review', skills: [5, 6] },
      { label: 'api', skills: [1, 2] },
      { label: 'review', skills: [3, 4] },
    ],
  };
  const scanned = await cluster(directory, claude(directory, envelope(answer)));
  assert.deepEqual(scanned.groups, [
    ['review', ['deploy', 'release-notes', 'review', 'review-fast']],
    ['api', ['api-get', 'api-list']],
  ]);
});

test('a group the model labels `other` is dropped, not drawn beside the wordless one', async (t) => {
  const directory = repository(t);
  // `other` is the word the wordless leftover group is drawn under. A model group labelled `other`
  // must not print a second `other` section: it is dropped, and its skills fall to the wordless one.
  const answer = { groups: [{ label: 'other', skills: [1, 2] }, { label: 'review', skills: [5, 6] }] };
  const scanned = await cluster(directory, claude(directory, envelope(answer)));
  assert.deepEqual(scanned.groups, [
    ['review', ['review', 'review-fast']],
    ['other', ['api-get', 'api-list', 'deploy', 'release-notes']],
  ]);
  // One `other` section, not two.
  assert.equal(scanned.stdout.split('\n').filter((line) => /^other · \d+ skills?$/.test(line)).length, 1);
});

test('at most eight groups', async (t) => {
  const skills = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`skill-${index + 1}`, `Does thing ${index + 1}.`]));
  const directory = repository(t, skills);
  const answer = { groups: Array.from({ length: 10 }, (_, index) => ({ label: `group${index}`, skills: [index * 2 + 1, index * 2 + 2] })) };
  const scanned = await cluster(directory, claude(directory, envelope(answer)));
  assert.equal(scanned.groups.length, 9, 'eight groups and the wordless one');
  assert.equal(scanned.groups.at(-1)?.[0], 'other');
});

// Every way the model can fail to answer: the scan goes on, with the shared words' groups and a
// warning that says which command failed and why.
const FALLBACK: [string, string, string, number][] = [
  ['an answer that is not JSON', envelope('Here are the groups you asked for!'), 'its answer is not the JSON it was asked for: Here are the groups you asked for!', 0],
  ['output that is not the envelope', 'not json at all', 'its output is not JSON: not json at all', 0],
  ['an envelope with no groups', envelope({ clusters: [] }), 'its answer has no groups', 0],
  ['groups that do not divide the skills', envelope({ groups: [{ label: 'everything', skills: [1, 2, 3, 4, 5, 6] }] }), "the model's groups do not divide the skills", 0],
  ['a CLI that reports an error', envelope('Not logged in · Please run /login', true), 'Not logged in · Please run /login', 1],
  ['a CLI that prints nothing', '', 'exited with 1', 1],
];

for (const [what, prints, expected, code] of FALLBACK) {
  test(`${what} → a warning, and the shared words group the skills`, async (t) => {
    const directory = repository(t);
    const scanned = await cluster(directory, claude(directory, prints, code));
    assert.equal(scanned.code, 0, scanned.stderr);
    assert.deepEqual(scanned.groups, SHARED_WORDS);
    assert.ok(
      scanned.stderr.includes(`${expected}; grouped by shared words instead`),
      `the warning says why: ${scanned.stderr}`,
    );
  });
}

test('a CLI that is not on the PATH → a warning, and the shared words group the skills', async (t) => {
  const directory = repository(t);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', directory, '--cluster'], {
    open: (input) => openDirectory(input),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
    cluster: { command: join(directory, 'no-such-claude') },
  });
  assert.equal(code, 0, stderr.join('\n'));
  assert.deepEqual(groups(stdout.join('\n')), SHARED_WORDS);
  assert.match(stderr.join('\n'), /no-such-claude: not found on the PATH; grouped by shared words instead$/m);
});

test('a CLI that never answers → a warning when the wait is over, and the scan goes on', async (t) => {
  const directory = repository(t);
  const command = claude(directory, envelope({ groups: [{ label: 'reading', skills: [1, 2] }] }));
  // A run that outlives its timeout, as a CLI waiting on a model would: killed, and no answer read.
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', directory, '--cluster'], {
    open: (input) => openDirectory(input),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
    cluster: {
      command,
      timeout: 50,
      run: () => new Promise((resolve) => setTimeout(() => resolve({ code: null, stdout: '', stderr: '', failure: 'no answer in 0s' }), 10)),
    },
  });
  assert.equal(code, 0, stderr.join('\n'));
  assert.deepEqual(groups(stdout.join('\n')), SHARED_WORDS);
  assert.match(stderr.join('\n'), /no answer in 0s; grouped by shared words instead$/m);
});

test('fewer than three skills are not worth asking about: no model is run, and no warning', async (t) => {
  const directory = repository(t, { 'api-get': 'Get one record.', 'api-list': 'List the records.' });
  const scanned = await cluster(directory, claude(directory, envelope({ groups: [{ label: 'reading', skills: [1, 2] }] })));
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.equal(scanned.stderr, '');
  // The stand-in was never run, so it wrote nothing down.
  assert.throws(() => asked(directory));
});

test('--cluster is not for an organization: a clear message, exit code 1', async () => {
  const stderr: string[] = [];
  const code = await run(['scan', 'github.com/JetBrains', '--cluster'], {
    open: () => Promise.reject(new Error('a repository was opened')),
    openOrganization: () => Promise.reject(new Error('an organization was opened')),
    print: () => {},
    error: (text) => stderr.push(text),
  });
  assert.equal(code, 1);
  assert.match(stderr.join('\n'), /^--cluster groups the skills of a repository; an organization is a count per repository$/);
});

test('without --cluster no model is asked at all', async (t) => {
  const directory = repository(t);
  const command = claude(directory, envelope({ groups: [{ label: 'reading', skills: [1, 2] }] }));
  const stdout: string[] = [];
  const code = await run(['scan', directory], {
    open: (input) => openDirectory(input),
    print: (text) => stdout.push(text),
    error: () => {},
    cluster: { command: process.execPath, run: (_command, args, options) => runStandIn(command, args, options) },
  });
  assert.equal(code, 0);
  assert.deepEqual(groups(stdout.join('\n')), SHARED_WORDS);
  assert.throws(() => asked(directory));
});
