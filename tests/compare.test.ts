// The decisions in spec/cli.md under "Both groupings" and in spec/analysis.md under "Comparing the
// two groupings", checked on the real `scan --compare` with a stand-in for `claude -p`: the model's
// groups are given, so what is checked here is the comparison, not the model.
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { run } from '../src/commands.ts';
import { MODEL } from '../src/core/cluster.ts';
import { agreement } from '../src/core/compare.ts';
import type { SkillGroup } from '../src/core/group.ts';
import type { Skill } from '../src/core/model.ts';
import { openDirectory } from '../src/local.ts';
import { temporary } from './helpers.ts';

/** Six skills the shared words divide into `api`, `review` and the wordless rest. */
const SKILLS: Record<string, string> = {
  'api-get': 'Get one record.',
  'api-list': 'List the records.',
  'deploy': 'Ship it to production.',
  'release-notes': 'Write the notes of a release.',
  'review': 'Review a change before it is merged.',
  'review-fast': 'Review a small change quickly.',
};

function repository(t: TestContext, skills = SKILLS): string {
  const files: Record<string, string> = {};
  for (const [name, description] of Object.entries(skills)) {
    files[`.claude/skills/${name}/SKILL.md`] = `---\nname: ${name}\ndescription: ${description}\n---\n`;
  }
  return temporary(t, files);
}

/** `skill-atlas scan <directory> --compare`, with `answer` as what `claude -p` prints back. */
async function compare(directory: string, answer: unknown | undefined, flags: string[] = ['--compare']) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', directory, ...flags], {
    open: (input) => openDirectory(input),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
    cluster: {
      command: 'claude',
      // No answer at all stands for a model that cannot be asked: the CLI is not on the PATH.
      run: async () =>
        answer === undefined
          ? { code: null, stdout: '', stderr: '', failure: 'not found on the PATH' }
          : { code: 0, stdout: JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify(answer) }), stderr: '' },
    },
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n'), lines: stdout };
}

/** The model's groups for those six skills: two of its own, and one skill it leaves out. */
const ANSWER = { groups: [{ label: 'reading', skills: [1, 2, 6] }, { label: 'shipping', skills: [3, 4] }] };

test('both groupings, side by side, and how much they agree', async (t) => {
  const scanned = await compare(repository(t), ANSWER);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.deepEqual(scanned.lines, [
    'repo · 6 skills',
    '',
    'by the words they share                 by claude -p (claude-haiku-4-5)',
    'api · 2 skills                          reading · 3 skills',
    '  api-get                                 api-get',
    '  api-list                                api-list',
    'review · 2 skills                         review-fast',
    '  review                                shipping · 2 skills',
    '  review-fast                             deploy',
    'other · 2 skills                          release-notes',
    '  deploy                                other · 1 skill',
    '  release-notes                           review',
    '',
    // Of the 15 pairs: the two agree to keep api-get and api-list together and deploy and
    // release-notes together, and disagree about review/review-fast and about review-fast with each
    // of the api skills — three pairs.
    'The two agree about 12 of the 15 pairs of skills.',
  ]);
});

test('the columns are 38 characters, with two between them, and no line is padded past its end', async (t) => {
  const scanned = await compare(repository(t), ANSWER);
  for (const line of scanned.lines) {
    assert.ok(!/\s$/.test(line), `no trailing space: ${JSON.stringify(line)}`);
    // Where there is a right column, it starts at the same place on every line.
    const right = /^(.{38}) {2}\S/.exec(line);
    if (right) assert.equal(right[1].length, 38);
  }
});

test('a name too long for a column ends in an ellipsis rather than wrapping', async (t) => {
  const long = 'a-skill-with-an-unusually-long-name-that-does-not-fit';
  const directory = repository(t, { [long]: 'Does one thing.', 'api-get': 'Get one record.', 'api-list': 'List the records.' });
  const scanned = await compare(directory, { groups: [{ label: 'reading', skills: [2, 3] }] });
  const cut = scanned.lines.find((line) => line.includes('a-skill-with-an'));
  assert.ok(cut, 'the long name is printed');
  assert.match(cut, /^ {2}a-skill-with-an-unusually-long-name…/);
  // One column wide, still: the line it is on does not run into the one beside it.
  assert.equal(cut.slice(0, 38).length, 38);
});

test('the comparison is of the groups: no description, no date, no link', async (t) => {
  const scanned = await compare(repository(t), ANSWER);
  assert.doesNotMatch(scanned.stdout, /Get one record|updated \d{4}|file:\/\//);
});

test('a grouping of one group is printed as one group: there is a column to read it against', async (t) => {
  // Three skills the shared words put under one word, which alone would print no word at all.
  const directory = repository(t, { 'api-get': 'Get one.', 'api-list': 'List them.', 'api-delete': 'Remove one.' });
  const scanned = await compare(directory, { groups: [{ label: 'reading', skills: [1, 2] }] });
  assert.match(scanned.stdout, /^api · 3 skills {26}reading · 2 skills$/m);
  assert.match(scanned.stdout, /The two agree about 1 of the 3 pairs of skills\.$/m);
});

test('a model that cannot be asked has no column, and no agreement line', async (t) => {
  const scanned = await compare(repository(t), undefined);
  assert.equal(scanned.code, 0, scanned.stderr);
  assert.match(scanned.stdout, /^by the words they share {17}by claude -p \(claude-haiku-4-5\)$/m);
  // The column has one line, beside the first line of the words' own groups.
  assert.match(scanned.stdout, /^api · 2 skills {26}no groups: see the warning$/m);
  assert.doesNotMatch(scanned.stdout, /agree about/);
  // The words' grouping is printed in full, and the warning is the one --cluster gives.
  assert.match(scanned.stdout, /^review · 2 skills$/m);
  assert.match(scanned.stdout, /^other · 2 skills$/m);
  assert.match(scanned.stderr, /^warning: claude: not found on the PATH; grouped by shared words instead$/m);
});

test('the model asked for the comparison is the one named in the column', async (t) => {
  const stdout: string[] = [];
  let asked = '';
  await run(['scan', repository(t), '--compare'], {
    open: (input) => openDirectory(input),
    print: (text) => stdout.push(text),
    error: () => {},
    cluster: {
      model: 'claude-sonnet-5-5',
      run: async (_command, args) => {
        asked = args[args.indexOf('--model') + 1];
        return { code: 0, stdout: JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify(ANSWER) }), stderr: '' };
      },
    },
  });
  assert.equal(asked, 'claude-sonnet-5-5');
  assert.match(stdout.join('\n'), /by claude -p \(claude-sonnet-5-5\)$/m);
});

test('--compare is not for an organization: a clear message, exit code 1', async () => {
  const stderr: string[] = [];
  const code = await run(['scan', 'github.com/JetBrains', '--compare'], {
    open: () => Promise.reject(new Error('a repository was opened')),
    openOrganization: () => Promise.reject(new Error('an organization was opened')),
    print: () => {},
    error: (text) => stderr.push(text),
  });
  assert.equal(code, 1);
  assert.match(stderr.join('\n'), /^--compare groups the skills of a repository; an organization is a count per repository$/);
});

test('an unknown flag → the usage, exit code 1', async (t) => {
  const stderr: string[] = [];
  const code = await run(['scan', repository(t), '--compair'], {
    open: (input) => openDirectory(input),
    print: () => {},
    error: (text) => stderr.push(text),
  });
  assert.equal(code, 1);
  assert.match(stderr.join('\n'), /^Usage: skill-atlas scan <GitHub URL \| organization \| directory> \[--cluster \| --compare\]$/);
});

// The measure itself, on groupings made by hand: a pair is agreed about when both groupings put it
// together, or both keep it apart.
const skill = (name: string): Skill => ({ id: name, repository: 'repo', path: `${name}/SKILL.md`, name, description: '', commit: '', updatedAt: '', copies: [] });
const group = (word: string, ...names: string[]): SkillGroup => ({ word, skills: names.map(skill) });

test('two groupings that divide the skills the same way agree about every pair', () => {
  const skills = ['a', 'b', 'c', 'd'].map(skill);
  const one = [group('x', 'a', 'b'), group('y', 'c', 'd')];
  // The same division, under other words and in another order: nothing is said differently about it.
  const other = [group('second', 'c', 'd'), group('first', 'a', 'b')];
  assert.deepEqual(agreement(skills, one, other), { pairs: 6, agree: 6 });
});

test('a grouping that puts everything together agrees only about the pairs the other one does too', () => {
  const skills = ['a', 'b', 'c', 'd'].map(skill);
  const divided = [group('x', 'a', 'b'), group('y', 'c', 'd')];
  const whole = [group('everything', 'a', 'b', 'c', 'd')];
  // Of the six pairs, the two that `divided` puts together are the two both agree about.
  assert.deepEqual(agreement(skills, divided, whole), { pairs: 6, agree: 2 });
});

test('the wordless group counts as a group: two skills kept out of everything is something said', () => {
  const skills = ['a', 'b', 'c', 'd'].map(skill);
  const left = [group('x', 'a', 'b'), group('', 'c', 'd')];
  const right = [group('x', 'a', 'b'), group('y', 'c', 'd')];
  // `c` and `d` are together in both, whatever the second grouping calls the group.
  assert.deepEqual(agreement(skills, left, right), { pairs: 6, agree: 6 });
});

test('one skill is no pair at all', () => {
  const skills = [skill('a')];
  assert.deepEqual(agreement(skills, [group('', 'a')], [group('x', 'a')]), { pairs: 0, agree: 0 });
});

test('the model the comparison names by default is the small one', () => {
  assert.equal(MODEL, 'claude-haiku-4-5');
});
