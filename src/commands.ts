// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
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
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every project skill in a repository and print it
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
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | organization | directory>');
  // A GitHub URL with no repository part is an organization or a user account: its repositories.
  if (parseGitHubOrganization(args[0])) {
    if (!context.openOrganization) throw new AtlasError('Scanning an organization runs in the Node CLI only');
    const result = await scanOrganization(await context.openOrganization(args[0]));
    printOrganization(result, context);
    for (const warning of result.warnings) context.error(`warning: ${warning}`);
    return;
  }
  const result = await scan(await context.open(args[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
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

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence, date and link. */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  print(`${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    // Under the name, where a skill that has no date simply has no line.
    if (skill.updatedAt) print(`  updated ${skill.updatedAt}`);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
  }
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
