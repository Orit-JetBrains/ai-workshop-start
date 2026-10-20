// The local web view: a page with a field for a repository, its skills and their SKILL.md. The
// scan is the core's, on the server, so local directories and GITHUB_TOKEN work as for the CLI.
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { skillLink } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

/** Starts the web view on 127.0.0.1; resolves to its address once it listens. */
export async function serve(port: number, open: (input: string) => Promise<Source>): Promise<{ url: string; server: Server }> {
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
      send(200, 'application/json', JSON.stringify(await scanWithText(url.searchParams.get('repo') ?? '', open)));
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

/** The scan, each skill with its link and the SKILL.md it was read from. */
async function scanWithText(input: string, open: (input: string) => Promise<Source>) {
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
  return {
    repository: result.repository,
    skills: result.skills.map((skill) => {
      const read = bytes.get(skill.path);
      return { ...skill, link: skillLink(result.repository, skill), text: read ? decoder.decode(read) : '' };
    }),
    warnings: result.warnings,
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
  form { display: flex; gap: .5rem; padding: .75rem 1rem; border-bottom: 1px solid #8884; }
  form input { flex: 1; font: inherit; padding: .4rem .6rem; }
  form button { font: inherit; padding: .4rem 1rem; }
  main { display: grid; grid-template-columns: minmax(16rem, 1fr) 2fr; min-height: 0; }
  #list, #file { overflow: auto; padding: 1rem; min-height: 0; }
  #list { border-right: 1px solid #8884; }
  #search:not([hidden]) { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
  #search input { flex: 1; min-width: 0; font: inherit; padding: .3rem .5rem; }
  #count { font-size: .85rem; opacity: .8; white-space: nowrap; }
  h1 { font-size: 1.1rem; margin: 0 0 .75rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li.skill { padding: .5rem; border-radius: 6px; cursor: pointer; }
  li.skill:hover { background: #8882; }
  li.skill[aria-selected="true"] { background: #4a90e233; }
  .name { font-weight: 600; }
  .description, .copies { font-size: .9rem; opacity: .8; }
  .link { font-size: .8rem; word-break: break-all; }
  .warnings { margin-top: 1rem; font-size: .85rem; color: #b8860b; }
  .error { color: #d33; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: .9rem; }
</style>
</head>
<body>
<form id="scan">
  <input id="repo" name="repo" placeholder="https://github.com/owner/repo or a local directory" aria-label="Repository" required>
  <button>Scan</button>
</form>
<main>
  <section id="list">
    <div id="search" hidden>
      <input id="filter" type="search" placeholder="Filter skills" aria-label="Filter skills">
      <span id="count"></span>
    </div>
    <div id="results"></div>
  </section>
  <section id="file"></section>
</main>
<script>
const results = document.getElementById('results');
const search = document.getElementById('search');
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

function choose(item, skill) {
  for (const other of results.querySelectorAll('li.skill')) other.setAttribute('aria-selected', 'false');
  item.setAttribute('aria-selected', 'true');
  file.replaceChildren(element('h1', '', skill.path), element('pre', '', skill.text));
}

// Every skill of the last scan, with the item showing it: the filter hides items in place rather
// than rebuilding the list, so the skill chosen on the right stays chosen while the query narrows.
let rendered = [];

function matches(skill, query) {
  return skill.name.toLowerCase().includes(query) || (skill.description || '').toLowerCase().includes(query);
}

function applyFilter() {
  const query = filter.value.trim().toLowerCase();
  let shown = 0;
  for (const { item, skill } of rendered) {
    const show = !query || matches(skill, query);
    item.hidden = !show;
    if (show) shown++;
  }
  count.textContent = shown + ' of ' + rendered.length;
}

filter.addEventListener('input', applyFilter);

let latestScan = 0;
async function scan(input) {
  // Scans can overlap; only the most recent one may touch the page, so a slow earlier
  // response cannot overwrite a newer result that no longer matches the input or the URL.
  const token = ++latestScan;
  history.replaceState(null, '', '?repo=' + encodeURIComponent(input));
  results.replaceChildren(element('p', '', 'Scanning…'));
  file.replaceChildren();
  // A scan starts from the whole list again: the previous query says nothing about these skills.
  rendered = [];
  filter.value = '';
  search.hidden = true;
  let answer;
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(input));
    answer = await response.json();
  } catch (error) {
    answer = { error: String(error) };
  }
  if (token !== latestScan) return;
  if (answer.error) return results.replaceChildren(element('p', 'error', answer.error));
  const total = answer.skills.length;
  const items = element('ul');
  for (const skill of answer.skills) {
    const item = element('li', 'skill');
    item.tabIndex = 0;
    item.setAttribute('role', 'option');
    item.append(element('div', 'name', skill.name));
    if (skill.description) item.append(element('div', 'description', skill.description));
    const link = element('a', 'link', skill.link);
    link.href = skill.link;
    link.target = '_blank';
    item.append(link);
    if (skill.copies.length) item.append(element('div', 'copies', 'also in ' + skill.copies.join(', ')));
    item.addEventListener('click', (event) => { if (event.target !== link) choose(item, skill); });
    item.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target !== link) choose(item, skill); });
    items.append(item);
    rendered.push({ item, skill });
  }
  results.replaceChildren(element('h1', '', answer.repository.id + ' · ' + total + (total === 1 ? ' skill' : ' skills')), items);
  if (answer.warnings.length) {
    const warnings = element('ul', 'warnings');
    for (const warning of answer.warnings) warnings.append(element('li', '', 'warning: ' + warning));
    results.append(warnings);
  }
  search.hidden = false;
  applyFilter();
  const first = items.querySelector('li.skill');
  if (first) choose(first, answer.skills[0]);
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
