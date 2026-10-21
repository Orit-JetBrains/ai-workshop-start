// The local web view: a page with a field for a repository, its skills and their SKILL.md, or for an
// organization, its repositories that have skills. The scan is the core's, on the server, so local
// directories and GITHUB_TOKEN work as for the CLI.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { parseGitHubOrganization } from './core/github.ts';
import { clusterSkills, type ClusterOptions } from './core/cluster.ts';
import { groupSkills, groupWords } from './core/group.ts';
import { skillLink } from './core/model.ts';
import { scan, scanOrganization, type OrganizationSource, type Source } from './core/scan.ts';

/**
 * Starts the web view on 127.0.0.1; resolves to its address once it listens. Without
 * `openOrganization`, an organization in the field is passed to `open`, which explains itself.
 */
export async function serve(
  port: number,
  open: (input: string) => Promise<Source>,
  openOrganization?: (input: string) => Promise<OrganizationSource>,
  cluster?: ClusterOptions,
): Promise<{ url: string; server: Server }> {
  const server = createServer(async (request, response) => {
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    // Parse the request target defensively: a malformed URL must not reject the async handler.
    let url: URL;
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1');
    } catch {
      return send(400, 'text/plain', 'Bad request');
    }
    if (request.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname !== '/api/scan') return send(404, 'text/plain', 'Not found');
    try {
      const input = (url.searchParams.get('repo') ?? '').trim();
      // `cluster=1`: the groups come from `claude -p` instead of from the words the skills share.
      const clustered = ['1', 'true', 'yes'].includes((url.searchParams.get('cluster') ?? '').toLowerCase());
      const answer =
        openOrganization && parseGitHubOrganization(input)
          ? await scanOrganization(await openOrganization(input))
          : await scanWithText(input, open, clustered ? (cluster ?? {}) : undefined);
      send(200, 'application/json', JSON.stringify(answer));
    } catch (error) {
      const message = error instanceof AtlasError ? error.message : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      send(400, 'application/json', JSON.stringify({ error: message }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    // Any listen failure, not just a port in use, becomes a clean message rather than an uncaught throw.
    const onStartupError = (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'EADDRINUSE'
          ? new AtlasError(`Port ${port} is in use; try serve <port>`)
          : new AtlasError(`Cannot serve on 127.0.0.1:${port}: ${error.message}`),
      );
    server.once('error', onStartupError);
    server.listen(port, '127.0.0.1', () => {
      // Startup is done; a later runtime error must be logged, not swallowed by the settled promise.
      server.removeListener('error', onStartupError);
      server.on('error', (error) => console.error(`Skill Atlas server error: ${error.message}`));
      resolve();
    });
  });
  const address = server.address();
  return { url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/`, server };
}

/**
 * The scan, each skill with its link and the SKILL.md it was read from. With `cluster`, the groups
 * are the model's, as `--cluster` asks for them; without it, the words the skills share.
 */
async function scanWithText(input: string, open: (input: string) => Promise<Source>, cluster?: ClusterOptions) {
  if (!input.trim()) throw new AtlasError('Enter a GitHub URL or a directory');
  const source = await open(input.trim());
  // The bytes the scan reads, kept for this answer only. Decoding is deferred to the few skill
  // files actually returned, so the page's text is decoded once rather than for every file read.
  const bytes = new Map<string, Uint8Array>();
  const result = await scan({
    ...source,
    read: async (path) => {
      const read = await source.read(path);
      if (read) bytes.set(path, read);
      return read;
    },
  });
  const decoder = new TextDecoder();
  // The groups the skills fall into: their order is the page's, and each skill carries the word it
  // is under, so the list can be drawn from the skills alone.
  const grouped = cluster
    ? await clusterSkills(result.skills, result.repository.name, cluster)
    : { groups: groupSkills(result.skills, result.repository.name), warnings: [] };
  const groups = grouped.groups;
  const words = groupWords(groups);
  return {
    repository: result.repository,
    skills: result.skills.map((skill) => {
      const read = bytes.get(skill.path);
      return {
        ...skill,
        group: words.get(skill.id) ?? '',
        link: skillLink(result.repository, skill),
        text: read ? decoder.decode(read) : '',
      };
    }),
    groups: groups.map((group) => ({ word: group.word, skills: group.skills.length })),
    warnings: [...result.warnings, ...grouped.warnings],
  };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; display: grid; grid-template-rows: auto 1fr; height: 100vh; }
  /* The top bar: the scan field on the left, the filter on the right. Both stay on screen whatever
     the list below shows, and only the list scrolls. */
  header { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; padding: .75rem 1rem; border-bottom: 1px solid #8884; }
  form { display: flex; gap: .5rem; min-width: 0; }
  form input { flex: 1; min-width: 0; font: inherit; padding: .4rem .6rem; }
  form button { font: inherit; padding: .4rem 1rem; }
  main { display: grid; grid-template-columns: minmax(16rem, 1fr) 2fr; min-height: 0; }
  #list, #file { overflow: auto; padding: 1rem; min-height: 0; }
  #list { border-right: 1px solid #8884; }
  #search { display: flex; align-items: center; gap: .5rem; min-width: 0; }
  #search input { flex: 1; min-width: 0; font: inherit; padding: .4rem .6rem; }
  #count { font-size: .85rem; opacity: .8; white-space: nowrap; }
  h1 { font-size: 1.1rem; margin: 0 0 .75rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  /* The word a group of skills shares, above them: a label, not something to choose. */
  li.group { padding: .75rem .5rem .25rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; opacity: .75; }
  li.group .word { font-weight: 600; }
  li.skill, li.repository { padding: .5rem; border-radius: 6px; cursor: pointer; }
  li.skill:hover, li.repository:hover { background: #8882; }
  li.skill[aria-selected="true"] { background: #4a90e233; }
  .name { font-weight: 600; }
  .description, .copies, .hint { font-size: .9rem; opacity: .8; }
  .updated { font-size: .8rem; opacity: .7; }
  .link { font-size: .8rem; word-break: break-all; }
  .warnings { margin-top: 1rem; font-size: .85rem; color: #b8860b; }
  .error { color: #d33; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: .9rem; }
</style>
</head>
<body>
<header>
  <form id="scan">
    <input id="repo" name="repo" placeholder="https://github.com/owner/repo, https://github.com/owner or a local directory" aria-label="Repository" required>
    <button>Scan</button>
  </form>
  <div id="search">
    <input id="filter" type="search" placeholder="Filter skills" aria-label="Filter skills">
    <span id="count"></span>
  </div>
</header>
<main>
  <section id="list">
    <div id="results"></div>
  </section>
  <section id="file"></section>
</main>
<script>
const results = document.getElementById('results');
const filter = document.getElementById('filter');
const count = document.getElementById('count');
const file = document.getElementById('file');
const repo = document.getElementById('repo');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The date the skill was last changed, as the list and the chosen file both show it; nothing at
// all for a skill with no date.
function updated(skill) {
  return skill.updatedAt ? [element('div', 'updated', 'updated ' + skill.updatedAt)] : [];
}

function choose(item, skill) {
  for (const other of results.querySelectorAll('li.skill')) other.setAttribute('aria-selected', 'false');
  item.setAttribute('aria-selected', 'true');
  file.replaceChildren(element('h1', '', skill.path), ...updated(skill), element('pre', '', skill.text));
}

// Every skill, or repository, of the last scan: the item showing it and the texts the filter looks
// in. The filter hides items in place rather than rebuilding the list, so the skill chosen on the
// right stays chosen while the query narrows. Undefined while there is no list.
let rendered;

// The groups of the last scan's skills: each heading and the entries under it, so the filter can
// hide a heading whose skills it has all hidden. Undefined for a list that has no groups at all —
// an organization's repositories.
let groups;

function matches(entry, query) {
  return entry.texts.some((text) => text.toLowerCase().includes(query));
}

// The filter, set to a fresh list; what it filters is in its placeholder.
function showFilter(what) {
  filter.placeholder = 'Filter ' + what;
  filter.setAttribute('aria-label', 'Filter ' + what);
  applyFilter();
}

function applyFilter() {
  // No list yet, or a scan running or failed: nothing to count.
  if (!rendered) return (count.textContent = '');
  const query = filter.value.trim().toLowerCase();
  let shown = 0;
  for (const entry of rendered) {
    const { item } = entry;
    const show = !query || matches(entry, query);
    item.hidden = !show;
    if (show) shown++;
  }
  // A group is only there for the skills under it: with none of them left, the word goes too.
  for (const group of groups ?? []) group.heading.hidden = group.entries.every((entry) => entry.item.hidden);
  count.textContent = shown + ' of ' + rendered.length;
}

filter.addEventListener('input', applyFilter);

// cluster=1 in the address asks the server for the model's groups instead of the shared words'.
// It stays in the address across scans, so a repository chosen from an organization is clustered too.
const clustered = new URLSearchParams(location.search).get('cluster');
const clusters = clustered ? '&cluster=' + encodeURIComponent(clustered) : '';

let latestScan = 0;
async function scan(input) {
  // Scans can overlap; only the most recent one may touch the page, so a slow earlier
  // response cannot overwrite a newer result that no longer matches the input or the URL.
  const token = ++latestScan;
  history.replaceState(null, '', '?repo=' + encodeURIComponent(input) + clusters);
  results.replaceChildren(element('p', '', 'Scanning…'));
  file.replaceChildren();
  // A scan starts from the whole list again: the previous query says nothing about these skills.
  rendered = undefined;
  groups = undefined;
  filter.value = '';
  applyFilter();
  let answer;
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(input) + clusters);
    answer = await response.json();
  } catch (error) {
    answer = { error: String(error) };
  }
  if (token !== latestScan) return;
  if (answer.error) return results.replaceChildren(element('p', 'error', answer.error));
  if (answer.organization) return showOrganization(answer);
  rendered = [];
  groups = [];
  const total = answer.skills.length;
  const items = element('ul');
  let first;
  // One section per group of skills that share a word, in the scan's order, the word above it; the
  // skills inside it keep the list's own order. A group whose skills the filter all hides goes with
  // them, heading and count included, so the list never shows a word with nothing under it.
  // One group is no division — the skills share a word with nothing, or all share the same one —
  // and then the list is drawn as it was before there were groups.
  const grouped = answer.groups.length > 1;
  for (const group of answer.groups) {
    const heading = element('li', 'group');
    const members = answer.skills.filter((skill) => skill.group === group.word);
    heading.append(element('span', 'word', group.word || 'other'));
    heading.append(element('span', 'tally', ' · ' + group.skills + (group.skills === 1 ? ' skill' : ' skills')));
    if (grouped) items.append(heading);
    const entries = [];
    for (const skill of members) {
      const item = element('li', 'skill');
      item.tabIndex = 0;
      item.setAttribute('role', 'option');
      item.append(element('div', 'name', skill.name));
      if (skill.description) item.append(element('div', 'description', skill.description));
      item.append(...updated(skill));
      const link = element('a', 'link', skill.link);
      link.href = skill.link;
      link.target = '_blank';
      item.append(link);
      if (skill.copies.length) item.append(element('div', 'copies', 'also in ' + skill.copies.join(', ')));
      item.addEventListener('click', (event) => { if (event.target !== link) choose(item, skill); });
      item.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target !== link) choose(item, skill); });
      items.append(item);
      const entry = { item, texts: [skill.name, skill.description || ''] };
      entries.push(entry);
      rendered.push(entry);
      first = first ?? { item, skill };
    }
    if (grouped) groups.push({ heading, entries });
  }
  results.replaceChildren(element('h1', '', answer.repository.id + ' · ' + total + (total === 1 ? ' skill' : ' skills')), items);
  showWarnings(answer.warnings);
  showFilter('skills');
  // The first skill of the list, which is the first of the first group: the strongest group's, not
  // the first by name, as the list no longer shows them in that order alone.
  if (first) choose(first.item, first.skill);
}

function showWarnings(list) {
  if (!list.length) return;
  const warnings = element('ul', 'warnings');
  for (const warning of list) warnings.append(element('li', '', 'warning: ' + warning));
  results.append(warnings);
}

// An organization: its repositories that have skills, each with its count. Choosing one scans it,
// as if its URL had been typed into the field.
function showOrganization(answer) {
  rendered = [];
  // An organization's repositories are a plain list: a count is not something to group by a word.
  groups = undefined;
  const total = answer.repositories;
  const items = element('ul');
  for (const repository of answer.withSkills) {
    const item = element('li', 'repository');
    item.tabIndex = 0;
    item.setAttribute('role', 'option');
    item.append(element('div', 'name', repository.name));
    item.append(element('div', 'description', repository.skills + (repository.skills === 1 ? ' skill' : ' skills')));
    const open = () => {
      repo.value = 'https://github.com/' + repository.id;
      scan(repo.value);
    };
    item.addEventListener('click', open);
    item.addEventListener('keydown', (event) => { if (event.key === 'Enter') open(); });
    items.append(item);
    rendered.push({ item, texts: [repository.name] });
  }
  const heading = answer.organization + ' · ' + total + (total === 1 ? ' repository' : ' repositories') + ', ' + answer.withSkills.length + ' with skills';
  results.replaceChildren(element('h1', '', heading), items);
  showWarnings(answer.warnings);
  showFilter('repositories');
  if (answer.withSkills.length) file.replaceChildren(element('p', 'hint', 'Choose a repository to see its skills.'));
}

document.getElementById('scan').addEventListener('submit', (event) => {
  event.preventDefault();
  scan(repo.value.trim());
});
const initial = new URLSearchParams(location.search).get('repo');
if (initial) { repo.value = initial; scan(initial); }
</script>
</body>
</html>
`;
