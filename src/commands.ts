// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { clusterSkills, MODEL, type ClusterOptions } from './core/cluster.ts';
import { agreement } from './core/compare.ts';
import { AtlasError } from './core/errors.ts';
import { divides, groupSkills, type SkillGroup } from './core/group.ts';
import { parseGitHubOrganization } from './core/github.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, scanOrganization, type OrganizationScanResult, type OrganizationSource, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  /** Opens an organization or user account to scan. The Node CLI only. */
  openOrganization?(input: string): Promise<OrganizationSource>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Starts the local web view; resolves to its address. The Node CLI only. */
  serve?(port: number): Promise<string>;
  /** How `--cluster` reaches `claude -p`. The Node CLI only; the tests answer for it. */
  cluster?: ClusterOptions;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every project skill in a repository and print it
  scan <input> --cluster          group them with claude -p instead of by the words they share
  scan <input> --compare          print both groupings, the words' and the model's, side by side
  scan github.com/<organization>  how many skills each repository of an organization has
  serve [port]                    a local web page: a repository's skills and their SKILL.md
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  // `--cluster` asks a model for the groups, `--compare` for both groupings; the rest is the input.
  const flags = new Set(args.filter((argument) => argument.startsWith('--')));
  const compare = flags.has('--compare');
  const cluster = flags.has('--cluster') || compare;
  const rest = args.filter((argument) => !argument.startsWith('--'));
  const unknown = [...flags].filter((flag) => flag !== '--cluster' && flag !== '--compare');
  if (unknown.length > 0 || rest.length !== 1) {
    throw new AtlasError('Usage: skill-atlas scan <GitHub URL | organization | directory> [--cluster | --compare]');
  }
  // A GitHub URL with no repository part is an organization or a user account: its repositories.
  if (parseGitHubOrganization(rest[0])) {
    if (cluster) {
      throw new AtlasError(
        `${compare ? '--compare' : '--cluster'} groups the skills of a repository; an organization is a count per repository`,
      );
    }
    if (!context.openOrganization) throw new AtlasError('Scanning an organization runs in the Node CLI only');
    const result = await scanOrganization(await context.openOrganization(rest[0]));
    printOrganization(result, context);
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
    return;
  }
  const result = await scan(await context.open(rest[0]));
  // The groups: the model's when asked for, the shared words' otherwise, and the shared words' when
  // the model cannot be asked — with a warning that says so.
  const grouped = cluster
    ? await clusterSkills(result.skills, result.repository.name, context.cluster)
    : { groups: groupSkills(result.skills, result.repository.name), warnings: [] };
  // `--compare` prints both groupings beside each other instead of one of them: the shared words'
  // groups are the scan's own, and the model's are what `--cluster` would have printed alone.
  if (compare) {
    const words = groupSkills(result.skills, result.repository.name);
    // A model that could not be asked has no column of its own: its warning says why, and what is
    // beside the words would only be the words again.
    printComparison(result.repository, result.skills, words, grouped.warnings.length > 0 ? undefined : grouped.groups, context);
  } else {
    printRepository(result.repository, result.skills, grouped.groups, context);
  }
  for (const warning of [...result.warnings, ...grouped.warnings]) context.error(`warning: ${warning}`);
}

async function serveCommand(args: string[], context: Context) {
  const usage = 'Usage: skill-atlas serve [port]';
  if (args.length > 1 || (args[0] !== undefined && !/^\d+$/.test(args[0]))) throw new AtlasError(usage);
  const port = args[0] === undefined ? 4321 : Number(args[0]);
  if (port > 65535) throw new AtlasError(usage);
  if (!context.serve) throw new AtlasError('serve runs in the Node CLI only');
  context.print(`Skill Atlas: ${await context.serve(port)}`);
}

/** `<organization> · N repositories, M with skills`, then each repository that has skills. */
function printOrganization(result: OrganizationScanResult, { print }: Context) {
  const repositories = `${result.repositories} ${result.repositories === 1 ? 'repository' : 'repositories'}`;
  print(`${result.organization} · ${repositories}, ${result.withSkills.length} with skills`);
  for (const repository of result.withSkills) {
    print(`${repository.name} · ${repository.skills} ${repository.skills === 1 ? 'skill' : 'skills'}`);
  }
}

/**
 * `<owner>/<repo> · N skills`, then each group of skills that share a word — the word above them —
 * and in it each skill's name, first sentence, date and link.
 */
function printRepository(repository: Repository, skills: Skill[], groups: SkillGroup[], { print }: Context) {
  print(`${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`);
  const grouped = divides(groups);
  for (const group of groups) {
    if (grouped) {
      // A blank line above each heading: the groups are the shape of the list, so they are read first.
      print('');
      print(`${group.word || 'other'} · ${group.skills.length} ${group.skills.length === 1 ? 'skill' : 'skills'}`);
    }
    for (const skill of group.skills) {
      print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
      // Under the name, where a skill that has no date simply has no line.
      if (skill.updatedAt) print(`  updated ${skill.updatedAt}`);
      print(`  ${skillLink(repository, skill)}`);
      if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
    }
  }
}

/** A column of the comparison: wide enough for a skill's name, narrow enough for two of them. */
const COLUMN = 38;

/**
 * Both groupings of the same skills, beside each other: the words they share on the left, the
 * model's on the right, each as its own list of groups, and under them how much the two agree.
 *
 * The columns do not line up group by group, because the groups do not correspond — a grouping is
 * its own division of the skills, and that is the thing being compared. What the two say about the
 * skills is the last line.
 */
function printComparison(repository: Repository, skills: Skill[], words: SkillGroup[], model: SkillGroup[] | undefined, { print, cluster }: Context) {
  print(`${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`);
  print('');
  const asked = `claude -p (${cluster?.model ?? MODEL})`;
  const left = ['by the words they share', ...column(words)];
  const right = model ? [`by ${asked}`, ...column(model)] : [`by ${asked}`, 'no groups: see the warning'];
  for (let line = 0; line < Math.max(left.length, right.length); line++) {
    print(`${(left[line] ?? '').padEnd(COLUMN)}  ${right[line] ?? ''}`.trimEnd());
  }
  if (!model) return;
  print('');
  // Pair by pair, which is the only way two divisions of the same skills can be read against each
  // other: a group's word is the model's to choose, and `issue` and `issues` are the same group.
  const { pairs, agree } = agreement(skills, words, model);
  print(`The two agree about ${agree} of the ${pairs} ${pairs === 1 ? 'pair' : 'pairs'} of skills.`);
}

/** One grouping as the lines of a column: each word with its count, its skills under it. */
function column(groups: SkillGroup[]): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(cut(`${group.word || 'other'} · ${group.skills.length} ${group.skills.length === 1 ? 'skill' : 'skills'}`));
    for (const skill of group.skills) lines.push(cut(`  ${skill.name}`));
  }
  return lines;
}

/** A line that fits the column; a name too long for one ends in an ellipsis rather than wrapping. */
function cut(line: string): string {
  return line.length <= COLUMN ? line : `${line.slice(0, COLUMN - 1)}…`;
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
