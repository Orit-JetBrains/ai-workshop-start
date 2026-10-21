// Grouping by a model instead of by shared words: `claude -p`, the Claude Code CLI in print mode,
// with a small model — the skills' names and descriptions in, a few labelled groups out.
//
// The heuristic in group.ts stays the default, and this is what `--cluster` asks for: a model is a
// process away, needs a logged-in CLI, costs a fraction of a cent, and does not answer the same way
// twice, none of which a scan can promise. Every failure — no CLI, no login, a timeout, an answer
// that is not the JSON it was asked for — becomes a warning and the heuristic's groups, so a scan
// still prints its skills.
import { spawn } from 'node:child_process';
import { divides, groupSkills, type SkillGroup } from './group.ts';
import type { Skill } from './model.ts';

/** How the model is reached, and which one answers. */
export type ClusterOptions = {
  /** The CLI to run; `claude`, on the PATH, by default. */
  command?: string;
  /** The model to ask: a small one, as grouping a handful of short texts needs no more. */
  model?: string;
  /** How long it may take, in milliseconds. */
  timeout?: number;
  /** Runs the CLI; the real one by default, so the tests can answer for it. */
  run?: (command: string, args: string[], input: { timeout: number }) => Promise<CommandResult>;
};

export type CommandResult = { code: number | null; stdout: string; stderr: string; failure?: string };

/** The model `claude -p` is asked for: the small one. */
export const MODEL = 'claude-haiku-4-5';

const DEFAULTS = { command: 'claude', model: MODEL, timeout: 120_000 };

/** At most this many groups, and a label no longer than this: a group is a word, not a sentence. */
const MOST_GROUPS = 8;
const LONGEST_LABEL = 24;
/** How much of a description the model is shown: enough to tell skills apart, not whole paragraphs. */
const DESCRIPTION = 240;

/**
 * A repository's skills, grouped by the model. Returns the heuristic's groups and a warning when
 * the model cannot be asked or does not answer with the groups it was asked for: the skills are the
 * scan's, and a grouping that failed is not worth the scan.
 */
export async function clusterSkills(
  skills: Skill[],
  repository: string,
  options: ClusterOptions = {},
): Promise<{ groups: SkillGroup[]; warnings: string[] }> {
  const fallback = (warning: string) => ({ groups: groupSkills(skills, repository), warnings: [`${warning}; grouped by shared words instead`] });
  // Nothing to divide: two skills are not worth a model's answer, and one is not worth anyone's.
  if (skills.length < 3) return { groups: groupSkills(skills, repository), warnings: [] };
  // Each default is taken for an option that is not there *and* for one that is there as undefined,
  // which is what an unset environment variable passes down.
  const command = options.command ?? DEFAULTS.command;
  const model = options.model ?? DEFAULTS.model;
  const timeout = options.timeout ?? DEFAULTS.timeout;
  const run = options.run ?? runCommand;
  let result: CommandResult;
  try {
    result = await run(command, args(prompt(skills, repository), model), { timeout });
  } catch (error) {
    return fallback(`${command}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.failure) return fallback(`${command}: ${result.failure}`);
  // What the CLI printed is read before its exit code, because it says more: `Not logged in · Please
  // run /login` comes with exit code 1, and the message is the part worth repeating.
  const answer = result.stdout.trim() ? answered(result.stdout) : { error: '' };
  if ('error' in answer) {
    const exited = result.code === 0 ? 'it printed nothing' : `exited with ${result.code}${first(result.stderr)}`;
    return fallback(`${command}: ${answer.error || exited}`);
  }
  if (result.code !== 0) return fallback(`${command}: exited with ${result.code}${first(result.stderr)}`);
  const groups = assign(skills, answer.groups);
  if (!divides(groups)) return fallback(`${command}: the model's groups do not divide the skills`);
  return { groups, warnings: [] };
}

/** `claude -p <prompt>`: one answer, as JSON, from the small model, with nothing of this machine in it. */
function args(prompt: string, model: string): string[] {
  return [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--model',
    model,
    // A grouping is a text answer: no tool may run for it, and nothing may wait for a human to allow one.
    '--permission-prompts',
    'none',
    '--system-prompt',
    'You group a repository’s agent skills by what they are for. You answer with JSON and nothing else.',
  ];
}

/** What the model is asked: the skills by number, and the shape of the answer. */
function prompt(skills: Skill[], repository: string): string {
  const listed = skills.map((skill, index) => {
    const description = skill.description.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION);
    return `${index + 1}. ${skill.name}${description ? ` — ${description}` : ''}`;
  });
  return [
    `Here are the ${skills.length} agent skills of the repository ${repository}.`,
    '',
    ...listed,
    '',
    `Group them by what they are for, into at most ${MOST_GROUPS} groups of two or more.`,
    `Each group's label is one lowercase word of ${LONGEST_LABEL} characters or fewer, taken from the skills' own words.`,
    `Do not label a group after the repository itself (${repository}): every skill in it is that.`,
    'A skill belongs to one group at most; leave out the ones that fit no group.',
    'Answer with this JSON and nothing else — no prose, no code fence:',
    '{"groups":[{"label":"<word>","skills":[<numbers>]}]}',
  ].join('\n');
}

type Answer = { groups: { label: string; skills: number[] }[] };

/**
 * The groups in what `claude -p --output-format json` printed: the envelope's `result`, which is the
 * model's own text, and in it the JSON it was asked for.
 */
function answered(stdout: string): Answer | { error: string } {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout.trim());
  } catch {
    return { error: `its output is not JSON${first(stdout)}` };
  }
  if (typeof envelope !== 'object' || envelope === null) return { error: 'its output is not an answer' };
  const { result, is_error: failed } = envelope as { result?: unknown; is_error?: unknown };
  if (typeof result !== 'string') return { error: 'its answer has no result' };
  // `is_error` is how the CLI reports its own failures — not logged in, say — with exit code 0.
  if (failed === true) return { error: `${firstLine(result) || 'it reported an error'}` };
  let parsed: unknown;
  try {
    // A fenced block, in case the model wrapped the JSON after all.
    parsed = JSON.parse(/^```(?:json)?\s*([\s\S]*?)```$/m.exec(result.trim())?.[1] ?? result.trim());
  } catch {
    return { error: `its answer is not the JSON it was asked for${first(result)}` };
  }
  const { groups } = (parsed ?? {}) as { groups?: unknown };
  if (!Array.isArray(groups)) return { error: 'its answer has no groups' };
  const read: Answer['groups'] = [];
  for (const group of groups) {
    const { label, skills } = (group ?? {}) as { label?: unknown; skills?: unknown };
    if (typeof label !== 'string' || !Array.isArray(skills)) continue;
    read.push({ label, skills: skills.filter((number): number is number => typeof number === 'number') });
  }
  return { groups: read };
}

/**
 * The model's groups, turned into the scan's: a label it may not have — too long, not a word, a
 * number of a skill that is not there, a skill in two groups — is the scan's to fix, not the user's.
 * Every skill the model left out, and every skill it lost, is in the last group, the one with no word.
 */
function assign(skills: Skill[], groups: Answer['groups']): SkillGroup[] {
  const taken = new Set<number>();
  const found: SkillGroup[] = [];
  for (const group of groups.slice(0, MOST_GROUPS)) {
    const word = group.label.trim().toLowerCase();
    // The label is a word of the same shape a shared word has: a group is read, not parsed.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(word) || word.length > LONGEST_LABEL) continue;
    const members = [...new Set(group.skills)]
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= skills.length && !taken.has(number))
      // In the scan's order, by name, whatever order the model put them in.
      .sort((a, b) => a - b);
    if (members.length < 2) continue;
    for (const number of members) taken.add(number);
    found.push({ word, skills: members.map((number) => skills[number - 1]) });
  }
  const rest = skills.filter((_, index) => !taken.has(index + 1));
  if (rest.length > 0) found.push({ word: '', skills: rest });
  return found;
}

/** Runs the CLI and collects what it printed; a CLI that is not there is a failure, not a throw. */
function runCommand(command: string, args: string[], { timeout }: { timeout: number }): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let failure: string | undefined;
    const timer = setTimeout(() => {
      failure = `no answer in ${Math.round(timeout / 1000)}s`;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => {
      clearTimeout(timer);
      // ENOENT: no such CLI on the PATH, which is the common case and reads as one.
      resolve({ code: null, stdout, stderr, failure: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not found on the PATH' : error.message });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, failure });
    });
  });
}

/** The first line of some output, for a warning that has to fit on one. */
function firstLine(text: string): string {
  return text.trim().split('\n')[0].slice(0, 200);
}

function first(text: string): string {
  const line = firstLine(text);
  return line ? `: ${line}` : '';
}
