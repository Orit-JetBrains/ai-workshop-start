import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { OrganizationSource, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, the SKILL.md files outside the skill roots are found through code search; without it, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`. */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

/** `https://github.com/owner`, with no repository part: an organization or a user account. */
export function parseGitHubOrganization(input: string): { organization: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/?$/i.exec(input.trim());
  return match ? { organization: match[1] } : undefined;
}

/**
 * Every repository of an organization or user account, and how to list each one's skill roots.
 * The skills are counted from those roots alone: no SKILL.md is read.
 */
export async function openOrganization(input: string, options: GitHubOptions): Promise<OrganizationSource> {
  const name = parseGitHubOrganization(input);
  if (!name) throw new AtlasError(`Not a GitHub organization URL: ${input}`);
  // An organization has far more repositories than the 60 requests an hour GitHub allows without a token.
  if (!options.token) {
    throw new AtlasError('Scanning an organization needs GITHUB_TOKEN: without it GitHub allows 60 requests an hour, too few for its repositories');
  }
  const github = client(options);
  const account = await github.json<{ login: string; type: string }>(
    `${API}/users/${encodeURIComponent(name.organization)}`,
    `Organization or user not found: https://github.com/${name.organization}`,
  );
  // An organization's repositories and a user's come from different endpoints; the login tells which.
  const listing = account.type === 'Organization' ? `${API}/orgs/${account.login}/repos` : `${API}/users/${account.login}/repos`;
  const branches = new Map<string, string>();
  for (let page = 1; ; page++) {
    const items = await github.json<{ full_name: string; default_branch: string }[]>(`${listing}?per_page=100&page=${page}`);
    for (const item of items) branches.set(item.full_name, item.default_branch);
    if (items.length < 100) break;
  }
  return {
    organization: account.login,
    repositories: [...branches.keys()],
    warnings: [],
    paths: async (id) => {
      const branch = branches.get(id);
      if (!branch) throw new AtlasError(`Not a repository of ${account.login}: ${id}`);
      const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/${encodePath(branch)}`);
      return rootPaths(github, id, sha);
    },
  };
}

/** Resolves the default branch to a commit and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<{ full_name: string; default_branch: string }>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  const id = info.full_name;
  const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/${encodePath(info.default_branch)}`);
  const warnings: string[] = [];
  const paths = await listPaths(github, id, sha, Boolean(options.token), warnings);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/**
 * The skills come from the skill roots' trees, which tell a symbolic link from a file and have no
 * result limit. The SKILL.md files elsewhere, to flag: from the whole tree, or with a token, code search.
 */
async function listPaths(github: Client, id: string, sha: string, token: boolean, warnings: string[]): Promise<string[]> {
  if (!token) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
    if (!tree.truncated) return files(tree);
    warnings.push(
      `the tree is too large to list at once; a SKILL.md outside ${SKILL_ROOTS.join(', ')} is not flagged (GITHUB_TOKEN searches everywhere)`,
    );
    return rootPaths(github, id, sha);
  }
  const [inRoots, found] = await Promise.all([rootPaths(github, id, sha), searchPaths(github, id, warnings)]);
  const outside = found.filter((path) => !SKILL_ROOTS.some((root) => path.startsWith(`${root}/`)));
  return [...inRoots, ...outside];
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string, warnings: string[]): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
    if (page === 10) warnings.push(`code search stops at 1000 SKILL.md files; the others outside ${SKILL_ROOTS.join(', ')} are not flagged`);
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** Every file in the skill roots, the roots at the same time. */
async function rootPaths(github: Client, id: string, sha: string): Promise<string[]> {
  const lists = await Promise.all(
    SKILL_ROOTS.map(async (root) => {
      const rootSha = await directory(github, id, sha, root);
      return rootSha ? (await rootFiles(github, id, rootSha)).map((path) => `${root}/${path}`) : [];
    }),
  );
  return lists.flat();
}

/**
 * A skill root's whole tree; when it is too large for one answer, its files and each directory's own
 * files, as a skill is one level down: no skill is lost.
 */
async function rootFiles(github: Client, id: string, rootSha: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  const top = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}`);
  const directories = top.tree.filter((item) => item.type === 'tree');
  const lists = await Promise.all(
    directories.map(async (item) => {
      const own = await github.json<Tree>(`${API}/repos/${id}/git/trees/${item.sha}`);
      return files(own).map((path) => `${item.path}/${path}`);
    }),
  );
  return [...files(top), ...lists.flat()];
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    if (response.status === 404) throw new AtlasError(notFound);
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new AtlasError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
